import { resourceQueuePayload } from "../queue-contract";
import { randomUUID } from "node:crypto";

import { Logger, type OnModuleDestroy } from "@nestjs/common";
import { closeDatabaseClient, type DatabaseClient } from "@repurposepro/db";
import { type Job } from "bullmq";
import { z } from "zod";

import { deriveCaptionLines } from "../services/analysis-pipeline.service";
import type { GeminiClipRegenerator } from "../services/gemini-clip-regenerator.service";

const frozenRequestSchema = z.object({
  sourceId: z.uuid(),
  transcriptId: z.uuid(),
  sourceDurationSeconds: z.number().finite().positive(),
  transcript: z
    .array(
      z.object({
        startSeconds: z.number().finite().nonnegative(),
        endSeconds: z.number().finite().positive(),
        text: z.string().trim().min(1),
      }),
    )
    .min(1),
  excludedCandidates: z.array(
    z.object({
      startTime: z.number().finite().nonnegative(),
      endTime: z.number().finite().positive(),
    }),
  ),
});

export class ClipRegenerationLeaseLostError extends Error {
  public constructor() {
    super("Clip regeneration lease lost.");
    this.name = "ClipRegenerationLeaseLostError";
  }
}

export class ClipRegenerationProcessor implements OnModuleDestroy {
  private readonly logger = new Logger(ClipRegenerationProcessor.name);

  public constructor(
    private readonly database: DatabaseClient,
    private readonly regenerator: Pick<GeminiClipRegenerator, "regenerate">,
  ) {}

  public async onModuleDestroy(): Promise<void> {
    await closeDatabaseClient(this.database);
  }

  public async process(job: Pick<Job, "id" | "name" | "data">): Promise<void> {
    const { jobId, projectId } = resourceQueuePayload(job, ["regenerate_clip_candidate"]);
    const token = randomUUID();
    const raw = await this.query<unknown>(
      "SELECT public.acquire_clip_regeneration($1,$2,$3) AS result",
      [jobId, projectId, token],
    );
    if (z.object({ terminal: z.literal(true) }).safeParse(raw).success) return;
    if (!raw) throw new Error("Clip regeneration lease unavailable.");

    const controller = new AbortController();
    let heartbeat: Promise<void> | undefined;
    const touch = async () => {
      try {
        const valid = await this.query<boolean>(
          "SELECT public.touch_clip_regeneration($1,$2) AS result",
          [jobId, token],
        );
        if (!valid) throw new ClipRegenerationLeaseLostError();
      } catch {
        const error = new ClipRegenerationLeaseLostError();
        controller.abort(error);
        throw error;
      }
    };
    const timer = setInterval(() => {
      if (!heartbeat) {
        heartbeat = touch()
          .catch(() => undefined)
          .finally(() => {
            heartbeat = undefined;
          });
      }
    }, 2000);

    try {
      const request = frozenRequestSchema.parse(raw);
      await touch();
      const segments = request.transcript.map((segment, sequence) => ({
        ...segment,
        sequence,
        words: null,
      }));
      const candidate = await this.regenerator.regenerate({
        sourceDurationSeconds: request.sourceDurationSeconds,
        transcript: segments.map((segment) => ({
          startTime: segment.startSeconds,
          endTime: segment.endSeconds,
          sequence: segment.sequence,
          text: segment.text,
        })),
        excludedCandidates: request.excludedCandidates,
        signal: controller.signal,
      });
      clearInterval(timer);
      await heartbeat;
      if (controller.signal.aborted) throw controller.signal.reason;
      await touch();
      const replacementId = await this.query<string | null>(
        "SELECT public.complete_clip_regeneration($1,$2,$3) AS result",
        [
          jobId,
          token,
          {
            ...candidate,
            captionLines: deriveCaptionLines(candidate.startTime, candidate.endTime, segments),
          },
        ],
      );
      if (!replacementId) {
        const error = new ClipRegenerationLeaseLostError();
        controller.abort(error);
        throw error;
      }
      this.logger.log({
        event: "clip_regeneration_completed",
        jobId,
        replacementClipId: replacementId,
      });
    } catch (error: unknown) {
      clearInterval(timer);
      await heartbeat;
      await this.query<boolean>("SELECT public.fail_clip_regeneration($1,$2,$3) AS result", [
        jobId,
        token,
        !controller.signal.aborted,
      ]).catch(() => undefined);
      this.logger.warn({
        event: "clip_regeneration_failed",
        jobId,
        failureCode: controller.signal.aborted
          ? "execution_lease_lost"
          : "regeneration_retry_requested",
      });
      if (controller.signal.aborted) throw controller.signal.reason;
      throw error;
    } finally {
      clearInterval(timer);
      await heartbeat;
    }
  }

  private async query<T>(statement: string, args: unknown[]): Promise<T | undefined> {
    return (await this.database.pool.query<{ result: T }>(statement, args)).rows[0]?.result;
  }
}
