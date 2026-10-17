import { dirname } from "node:path";
import { Injectable, Logger, type OnModuleDestroy } from "@nestjs/common";
import { loadApiConfig } from "@repurposepro/config";
import { CLEANUP_JOB, CLEANUP_QUEUE, type BulkClipDeleteInput } from "@repurposepro/shared";
import { Queue, type ConnectionOptions } from "bullmq";
import { DatabaseService } from "../infrastructure/database.service";
import { BullMqConnectionFactory } from "../infrastructure/bullmq-connection.factory";
import { LocalStorageService } from "../storage/local-storage.service";

export class DeletionError extends Error {
  constructor(public readonly code: string) {
    super(
      code === "PROJECT_BUSY"
        ? "Wait for uploads, processing, and rendering to finish before deleting this project."
        : code === "CLIP_BUSY"
          ? "Wait for the current render or regeneration to finish."
          : code === "CLIP_EDIT_CONFLICT"
            ? "A selected clip changed elsewhere. Reload the page and select your clips again."
            : code === "PROJECT_NOT_FOUND"
              ? "This project is no longer available."
              : code === "CLIP_NOT_FOUND"
                ? "A selected clip is no longer available. Reload the page."
                : code === "VALIDATION_ERROR"
                  ? "Choose valid clips and try again."
                  : "Could not delete this project. Please try again.",
    );
  }
}

@Injectable()
export class DeletionService implements OnModuleDestroy {
  private readonly logger = new Logger(DeletionService.name);
  private queue?: Queue;
  constructor(
    private readonly database: DatabaseService,
    private readonly storage: LocalStorageService,
    private readonly connections: BullMqConnectionFactory,
  ) {}

  async project(userId: string, projectId: string): Promise<void> {
    const directory = dirname(this.storage.sourcePaths(userId, projectId).directory).replaceAll(
      "\\",
      "/",
    );
    const result = await this.database.database.pool.query<{ result: { error?: string } }>(
      "SELECT public.delete_owned_project($1,$2,$3) AS result",
      [userId, projectId, directory],
    );
    this.check(result.rows[0]?.result);
    this.logger.log({ event: "project_deleted", projectId });
    // The committed storage registry is the durable fallback if this wake-up fails.
    void this.requestCleanup().catch(() =>
      this.logger.warn({ event: "project_cleanup_wakeup_failed", projectId }),
    );
  }

  async clips(userId: string, projectId: string, input: BulkClipDeleteInput): Promise<void> {
    const result = await this.database.database.pool.query<{ result: { error?: string } }>(
      "SELECT public.delete_owned_clip_candidates($1,$2,$3::jsonb) AS result",
      [userId, projectId, JSON.stringify(input.clips)],
    );
    this.check(result.rows[0]?.result);
    this.logger.log({ event: "clips_bulk_deleted", projectId, count: input.clips.length });
  }

  private check(result: { error?: string } | undefined) {
    if (!result) throw new Error("Deletion returned no result.");
    if (result.error) throw new DeletionError(result.error);
  }

  private async requestCleanup() {
    if (!this.queue) {
      this.queue = new Queue(CLEANUP_QUEUE, {
        connection: this.connections.createProducer() as unknown as ConnectionOptions,
        prefix: loadApiConfig().bullmqPrefix,
      });
      this.queue.on("error", () =>
        this.logger.warn({ event: "project_cleanup_queue_unavailable" }),
      );
    }
    await this.queue.add(
      CLEANUP_JOB,
      {},
      {
        attempts: 4,
        backoff: { type: "exponential", delay: 30_000 },
        removeOnComplete: { age: 86400, count: 100 },
        removeOnFail: 100,
      },
    );
  }
  async onModuleDestroy() {
    await this.queue?.close();
  }
}
