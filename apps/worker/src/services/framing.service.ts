import { randomUUID } from "node:crypto";
import { Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { closeDatabaseClient, type DatabaseClient } from "@repurposepro/db";
import { FRAMING_QUEUE } from "@repurposepro/shared";
import { Queue, Worker, type ConnectionOptions } from "bullmq";
import Redis from "ioredis";
import type { FaceTracker } from "./face-tracker.service";

export class FramingService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FramingService.name);
  private readonly abort = new AbortController();
  private connection?: Redis;
  private queue?: Queue;
  private worker?: Worker<{ id: string }>;
  private timer?: ReturnType<typeof setInterval>;
  private dispatching: Promise<void> | null = null;
  private readonly running = new Set<Promise<void>>();

  constructor(
    private readonly database: DatabaseClient,
    private readonly tracker: FaceTracker,
    private readonly options: { redisUrl: string; prefix: string },
  ) {}

  async onModuleInit() {
    this.connection = new Redis(this.options.redisUrl, { maxRetriesPerRequest: null });
    this.connection.on("error", () => this.logger.warn({ event: "framing_redis_unavailable" }));
    const connection = this.connection as unknown as ConnectionOptions;
    this.queue = new Queue(FRAMING_QUEUE, { connection, prefix: this.options.prefix });
    this.queue.on("error", () => this.logger.warn({ event: "framing_queue_unavailable" }));
    this.worker = new Worker<{ id: string }>(
      FRAMING_QUEUE,
      async (job) => {
        await this.process(String(job.data.id));
      },
      { connection, prefix: this.options.prefix, concurrency: 1 },
    );
    this.worker.on("error", () => this.logger.warn({ event: "framing_worker_unavailable" }));
    this.timer = setInterval(() => void this.dispatch(), 5_000);
    await this.dispatch();
  }

  async forJob(jobId: string, signal: AbortSignal) {
    try {
      const result = await this.database.pool.query<{ id: string | null }>(
        "SELECT public.request_job_framing($1) AS id",
        [jobId],
      );
      const id = result.rows[0]?.id;
      if (id) await this.process(id, signal);
    } catch {
      signal.throwIfAborted();
      this.logger.warn({ event: "framing_analysis_fallback", jobId });
    }
  }

  private dispatch(): Promise<void> {
    if (this.dispatching) return this.dispatching;
    this.dispatching = (async () => {
      try {
        const pending = await this.database.pool.query<{ id: string }>(
          "SELECT id FROM public.pending_video_framing()",
        );
        for (const { id } of pending.rows) {
          if (this.abort.signal.aborted) break;
          await this.queue?.add(
            "track_faces",
            { id },
            { jobId: id, removeOnComplete: true, removeOnFail: true },
          );
        }
      } catch {
        this.logger.warn({ event: "framing_dispatch_retry" });
      } finally {
        this.dispatching = null;
      }
    })();
    return this.dispatching;
  }

  async process(id: string, signal = this.abort.signal): Promise<void> {
    const task = this.run(id, signal);
    this.running.add(task);
    try {
      await task;
    } finally {
      this.running.delete(task);
    }
  }

  private async run(id: string, signal: AbortSignal): Promise<void> {
    signal.throwIfAborted();
    const token = randomUUID();
    const claim = await this.database.pool.query<{ source_path: string }>(
      "SELECT source_path FROM public.claim_video_framing($1,$2)",
      [id, token],
    );
    const source = claim.rows[0]?.source_path;
    if (!source) return;
    const started = Date.now();
    try {
      const data = await this.tracker.analyze(source, AbortSignal.any([signal, this.abort.signal]));
      await this.database.pool.query("SELECT public.finish_video_framing($1,$2,$3::jsonb)", [
        id,
        token,
        JSON.stringify(data),
      ]);
      this.logger.log({
        event: "framing_completed",
        id,
        durationMs: Date.now() - started,
        tracks: data.tracks.length,
        fallback: data.tracks.length === 0,
      });
    } catch {
      await this.database.pool.query("SELECT public.finish_video_framing($1,$2,NULL)", [id, token]);
      this.logger.warn({
        event: "framing_failed",
        id,
        durationMs: Date.now() - started,
        fallback: true,
      });
      signal.throwIfAborted();
    }
  }

  async onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    this.abort.abort();
    await this.dispatching;
    await this.worker?.close();
    await Promise.allSettled(this.running);
    await this.queue?.close();
    this.connection?.disconnect();
    await closeDatabaseClient(this.database);
  }
}
