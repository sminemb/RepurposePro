import type { OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import {
  checkDatabaseConnection,
  closeDatabaseClient,
  type DatabaseClient,
} from "@repurposepro/db";
import { z } from "zod";

import {
  timestampedTranscriptSchema,
  type TimestampedTranscript,
} from "./whisper-transcriber.service";
import type { CaptionLine, CaptionPosition, ClipCrop } from "@repurposepro/shared";

export const ANALYSIS_TRANSCRIPT_REPOSITORY = Symbol("ANALYSIS_TRANSCRIPT_REPOSITORY");

export interface PersistedTranscript extends TimestampedTranscript {
  readonly id: string;
  readonly model: string;
}

export type AnalysisTranscriptionContext =
  | { readonly outcome: "lost" }
  | { readonly outcome: "rejected" }
  | {
      readonly outcome: "ready";
      readonly projectId: string;
      readonly sourceDurationSeconds: number;
      readonly sourcePath: string;
      readonly transcript: null;
    }
  | {
      readonly outcome: "transcript_ready";
      readonly projectId: string;
      readonly sourceDurationSeconds: number;
      readonly sourcePath: string;
      readonly transcript: PersistedTranscript;
    };

export type PersistTranscriptOutcome =
  | { readonly outcome: "created" | "reused"; readonly transcriptId: string }
  | { readonly outcome: "lost"; readonly transcriptId: null }
  | { readonly outcome: "rejected"; readonly transcriptId: null };

export interface AnalysisTranscriptRepositoryContract {
  finalizePreview(
    jobId: string,
    workerId: string,
    leaseToken: string,
    promptVersion: "clips-v1",
    candidates: readonly AnalysisPreviewCandidateRecord[],
  ): Promise<"created" | "existing" | "lost" | "rejected">;
  isPreviewReady(jobId: string, projectId: string): Promise<boolean>;
  loadContext(
    jobId: string,
    workerId: string,
    leaseToken: string,
  ): Promise<AnalysisTranscriptionContext>;
  persist(
    jobId: string,
    workerId: string,
    leaseToken: string,
    model: string,
    transcript: TimestampedTranscript,
  ): Promise<PersistTranscriptOutcome>;
}

export interface AnalysisPreviewCandidateRecord {
  readonly captionLines: readonly CaptionLine[];
  readonly captionPosition: CaptionPosition;
  readonly captionStyle: "hormozi";
  readonly captionsEnabled: true;
  readonly crop: ClipCrop | null;
  readonly endTime: number;
  readonly kind: "backup" | "primary";
  readonly previewFontSize: number;
  readonly rank: number;
  readonly reason: string;
  readonly score: number;
  readonly startTime: number;
  readonly title: string;
}

interface ContextRow {
  readonly outcome: unknown;
  readonly projectId: unknown;
  readonly sourceDurationSeconds: unknown;
  readonly sourcePath: unknown;
  readonly transcript: unknown;
}

const readyContextSchema = z.object({
  projectId: z.string().uuid(),
  sourceDurationSeconds: z.coerce.number().finite().positive(),
  sourcePath: z.string().min(1),
});

export class AnalysisTranscriptRepository
  implements AnalysisTranscriptRepositoryContract, OnModuleInit, OnModuleDestroy
{
  public constructor(private readonly database: DatabaseClient) {}

  public async onModuleInit(): Promise<void> {
    await checkDatabaseConnection(this.database);
  }

  public async onModuleDestroy(): Promise<void> {
    await closeDatabaseClient(this.database);
  }

  public async loadContext(
    jobId: string,
    workerId: string,
    leaseToken: string,
  ): Promise<AnalysisTranscriptionContext> {
    const result = await this.database.pool.query<ContextRow>(
      `SELECT
        outcome,
        project_id AS "projectId",
        source_path AS "sourcePath",
        source_duration_seconds AS "sourceDurationSeconds",
        transcript
       FROM public.get_analysis_transcription_context($1, $2, $3)`,
      [jobId, workerId, leaseToken],
    );
    const row = result.rows[0];
    if (result.rows.length !== 1 || !row) {
      throw new Error("Analysis transcription context returned an invalid result.");
    }

    if (row.outcome === "lost" || row.outcome === "rejected") {
      if (
        row.projectId !== null ||
        row.sourceDurationSeconds !== null ||
        row.sourcePath !== null ||
        row.transcript !== null
      ) {
        throw new Error("Analysis transcription context returned an invalid result.");
      }
      return { outcome: row.outcome };
    }

    if (row.outcome !== "ready" && row.outcome !== "transcript_ready") {
      throw new Error("Analysis transcription context returned an invalid result.");
    }
    const context = readyContextSchema.safeParse(row);
    if (!context.success) {
      throw new Error("Analysis transcription context returned an invalid result.");
    }

    if (row.outcome === "ready") {
      if (row.transcript !== null) {
        throw new Error("Analysis transcription context returned an invalid result.");
      }
      return { ...context.data, outcome: "ready", transcript: null };
    }

    const transcript = parsePersistedTranscript(row.transcript);
    return { ...context.data, outcome: "transcript_ready", transcript };
  }

  public async isPreviewReady(jobId: string, projectId: string): Promise<boolean> {
    const result = await this.database.pool.query<{ readonly ready: unknown }>(
      "SELECT public.is_analysis_preview_ready($1, $2) AS ready",
      [jobId, projectId],
    );
    const ready = result.rows[0]?.ready;
    if (result.rows.length !== 1 || typeof ready !== "boolean") {
      throw new Error("Analysis preview state returned an invalid result.");
    }
    return ready;
  }

  public async finalizePreview(
    jobId: string,
    workerId: string,
    leaseToken: string,
    promptVersion: "clips-v1",
    candidates: readonly AnalysisPreviewCandidateRecord[],
  ): Promise<"created" | "existing" | "lost" | "rejected"> {
    const result = await this.database.pool.query<{ readonly outcome: unknown }>(
      "SELECT public.finalize_analysis_preview($1, $2, $3, $4, $5::jsonb) AS outcome",
      [jobId, workerId, leaseToken, promptVersion, JSON.stringify(candidates)],
    );
    const outcome = result.rows[0]?.outcome;
    if (
      result.rows.length !== 1 ||
      !["created", "existing", "lost", "rejected"].includes(String(outcome))
    ) {
      throw new Error("Analysis preview finalization returned an invalid result.");
    }
    return outcome as "created" | "existing" | "lost" | "rejected";
  }

  public async persist(
    jobId: string,
    workerId: string,
    leaseToken: string,
    model: string,
    transcript: TimestampedTranscript,
  ): Promise<PersistTranscriptOutcome> {
    const result = await this.database.pool.query<{
      readonly outcome: unknown;
      readonly transcriptId: unknown;
    }>(
      `SELECT outcome, transcript_id AS "transcriptId"
       FROM public.persist_analysis_transcript($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
      [
        jobId,
        workerId,
        leaseToken,
        transcript.language,
        model,
        transcript.durationSeconds,
        transcript.text,
        JSON.stringify(transcript.segments),
      ],
    );
    const row = result.rows[0];
    if (result.rows.length !== 1 || !row) {
      throw new Error("Analysis transcript persistence returned an invalid result.");
    }
    if (row.outcome === "lost" || row.outcome === "rejected") {
      if (row.transcriptId !== null) {
        throw new Error("Analysis transcript persistence returned an invalid result.");
      }
      return { outcome: row.outcome, transcriptId: null };
    }
    if (
      (row.outcome !== "created" && row.outcome !== "reused") ||
      !z.string().uuid().safeParse(row.transcriptId).success
    ) {
      throw new Error("Analysis transcript persistence returned an invalid result.");
    }
    return { outcome: row.outcome, transcriptId: row.transcriptId as string };
  }
}

function parsePersistedTranscript(value: unknown): PersistedTranscript {
  if (!isPlainRecord(value)) {
    throw new Error("Persisted analysis transcript returned an invalid result.");
  }
  const identity = z
    .object({ id: z.string().uuid(), model: z.string().trim().min(1).max(200) })
    .safeParse(value);
  const transcript = timestampedTranscriptSchema.safeParse({
    durationSeconds: value.durationSeconds,
    language: value.language,
    segments: value.segments,
    text: value.text,
  });
  if (!identity.success || !transcript.success) {
    throw new Error("Persisted analysis transcript returned an invalid result.");
  }
  return { ...transcript.data, ...identity.data };
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
