import { validateCleanupQueue, type QueueInput } from "../queue-contract";
import { randomUUID } from "node:crypto";
import { Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import type { WorkerConfig } from "@repurposepro/config";
import { closeDatabaseClient, type DatabaseClient } from "@repurposepro/db";
import { Queue, Worker, type ConnectionOptions } from "bullmq";
import Redis from "ioredis";
import { removeCleanupAsset, type CleanupAsset } from "./storage-cleanup";
import { discoverOrphans } from "./orphan-discovery";

export const CLEANUP_QUEUE = "cleanup-queue";
export const CLEANUP_JOB = "cleanup_expired_project_files";
export class CleanupWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CleanupWorkerService.name);
  private connection?: Redis;
  private queue?: Queue;
  private worker?: Worker;
  private projectCursor: string | null = null;
  private readonly orphanScanState = { offsets: new Map<string, number>() };
  constructor(
    private readonly database: DatabaseClient,
    private readonly config: WorkerConfig,
  ) {}
  async onModuleInit() {
    this.connection = new Redis(this.config.redisUrl, { maxRetriesPerRequest: null });
    this.connection.on("error", () => this.logger.warn({ event: "cleanup_redis_unavailable" }));
    const connection = this.connection as unknown as ConnectionOptions;
    const options = { connection, prefix: this.config.bullmqPrefix };
    this.queue = new Queue(CLEANUP_QUEUE, options);
    this.queue.on("error", () => this.logger.warn({ event: "cleanup_queue_error" }));
    this.worker = new Worker(
      CLEANUP_QUEUE,
      async (job) => {
        if (job.name !== CLEANUP_JOB) throw new Error("Invalid cleanup job.");
        return this.sweep();
      },
      { ...options, concurrency: this.config.cleanup.concurrency },
    );
    this.worker.on("error", () => this.logger.warn({ event: "cleanup_worker_error" }));
    await this.worker.waitUntilReady();
    const opts = {
      attempts: 4,
      backoff: { type: "exponential", delay: 30_000 },
      removeOnComplete: { age: 86400, count: 100 },
      removeOnFail: 100,
    };
    await this.queue.upsertJobScheduler(
      "expired-media-hourly",
      { pattern: this.config.cleanup.cron, tz: "UTC" },
      { name: CLEANUP_JOB, data: {}, opts },
    );
    await this.queue.add(
      CLEANUP_JOB,
      {},
      { ...opts, jobId: `startup-${Math.floor(Date.now() / 3_600_000)}` },
    );
  }
  async processQueue(job: QueueInput) {
    validateCleanupQueue(job);
    return this.sweep();
  }

  async sweep() {
    try {
      this.projectCursor = await discoverOrphans(
        this.database,
        this.config,
        this.projectCursor,
        this.orphanScanState,
      );
    } catch {
      this.logger.warn({ event: "cleanup_orphan_scan_retry" });
    }
    const token = randomUUID();
    const targets = (
      await this.database.pool.query<CleanupAsset & { id: string }>(
        "SELECT * FROM public.claim_expired_storage_targets($1,$2)",
        [token, this.config.cleanup.batchSize],
      )
    ).rows;
    let deleted = 0,
      failed = 0;
    for (const target of targets) {
      try {
        const renewed = (
          await this.database.pool.query<{ valid: boolean }>(
            "SELECT public.renew_storage_cleanup($1,$2) AS valid",
            [target.id, token],
          )
        ).rows[0]?.valid;
        if (!renewed) throw new Error("Cleanup lease lost.");
        await removeCleanupAsset(this.config.storageRoot, target);
        const completed = (
          await this.database.pool.query<{ valid: boolean }>(
            "SELECT public.finish_storage_cleanup($1,$2,true) AS valid",
            [target.id, token],
          )
        ).rows[0]?.valid;
        if (!completed) throw new Error("Cleanup confirmation lease lost.");
        deleted++;
      } catch {
        failed++;
        await this.database.pool
          .query<{ valid: boolean }>("SELECT public.finish_storage_cleanup($1,$2,false)", [
            target.id,
            token,
          ])
          .catch(() => undefined);
        this.logger.warn({ event: "cleanup_asset_retry", targetId: target.id, kind: target.kind });
      }
    }
    const totals = (
      await this.database.pool.query<{ pending: string; deferred: string }>(
        "SELECT * FROM public.storage_cleanup_totals()",
      )
    ).rows[0];
    this.logger.log({
      event: "cleanup_run_completed",
      claimed: targets.length,
      deleted,
      failed,
      pending: Number(totals?.pending ?? 0),
      deferred: Number(totals?.deferred ?? 0),
    });
    if (failed) throw new Error("Some expired assets require another cleanup attempt.");
    return { deleted, claimed: targets.length };
  }
  async onModuleDestroy() {
    await this.worker?.close();
    await this.queue?.close();
    await this.connection?.quit();
    await closeDatabaseClient(this.database);
  }
}
