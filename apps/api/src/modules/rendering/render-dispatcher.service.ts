import { randomUUID } from "node:crypto";
import {
  Inject,
  Injectable,
  Logger,
  type OnModuleInit,
  type OnModuleDestroy,
} from "@nestjs/common";
import { loadApiConfig } from "@repurposepro/config";
import { VIDEO_RENDER_QUEUE, RENDER_CLIP_JOB } from "@repurposepro/shared";
import { Queue, type ConnectionOptions } from "bullmq";
import { BullMqConnectionFactory } from "../infrastructure/bullmq-connection.factory";
import type { ScopedDatabaseService } from "../infrastructure/database.service";
import { PROCESSING_DATABASE } from "../processing/scoped-database.provider";

@Injectable()
export class RenderDispatcherService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RenderDispatcherService.name);
  private readonly queue: Queue;
  private timer?: NodeJS.Timeout;
  private running?: Promise<void>;
  public constructor(
    @Inject(PROCESSING_DATABASE) private readonly database: ScopedDatabaseService,
    connections: BullMqConnectionFactory,
  ) {
    this.queue = new Queue(VIDEO_RENDER_QUEUE, {
      connection: connections.createProducer() as unknown as ConnectionOptions,
      prefix: loadApiConfig().bullmqPrefix,
    });
    this.queue.on("error", () => this.logger.warn({ event: "render_queue_unavailable" }));
  }
  public onModuleInit() {
    const run = () => {
      if (!this.running)
        this.running = this.dispatch()
          .catch(() => this.logger.warn({ event: "render_dispatch_retry" }))
          .finally(() => {
            this.running = undefined;
          });
    };
    this.timer = setInterval(run, 3000);
    this.timer.unref();
    run();
  }
  public async onModuleDestroy() {
    clearInterval(this.timer);
    await this.running;
    await this.queue.close();
  }
  public async dispatch() {
    for (let index = 0; index < 20; index++) {
      const token = randomUUID();
      const claim = await this.database.database.pool.query<{
        job_id: string;
        project_id: string;
        job_status: string;
        attempt_count: number;
        lease_expired: boolean;
      }>("SELECT * FROM public.claim_render_dispatch($1)", [token]);
      const row = claim.rows[0];
      if (!row) return;
      let published = false;
      try {
        const existing = await this.queue.getJob(row.job_id);
        const state = await existing?.getState();
        if (
          state === "failed" ||
          state === "completed" ||
          (row.job_status === "active" && row.lease_expired && row.attempt_count >= 2)
        ) {
          await this.database.database.pool.query(
            "SELECT public.fail_clip_render($1,NULL,false,'RENDER_LEASE_EXPIRED')",
            [row.job_id],
          );
        } else {
          if (!existing && !(row.job_status === "active" && !row.lease_expired)) {
            if (row.job_status === "active" && row.lease_expired)
              await this.database.database.pool.query(
                "SELECT public.fail_clip_render($1,NULL,true,'RENDER_LEASE_EXPIRED')",
                [row.job_id],
              );
            await this.queue.add(
              RENDER_CLIP_JOB,
              { jobId: row.job_id, projectId: row.project_id },
              {
                jobId: row.job_id,
                attempts: 2,
                backoff: { type: "exponential", delay: 3000 },
                removeOnComplete: { age: 86400 },
                removeOnFail: { age: 604800 },
              },
            );
          }
          published = true;
        }
      } catch {
        this.logger.warn({ event: "render_dispatch_retry", jobId: row.job_id });
      }
      await this.database.database.pool.query("SELECT public.finish_render_dispatch($1,$2,$3)", [
        row.job_id,
        token,
        published,
      ]);
    }
  }
}
