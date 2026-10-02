import { randomUUID } from "node:crypto";
import { resolve } from "node:path";

import { closeDatabaseClient, createDatabaseClient, type DatabaseClient } from "@repurposepro/db";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { AnalysisJobProcessor } from "../../../../worker/src/processors/analysis-job.processor";
import { AnalysisPipelineService } from "../../../../worker/src/services/analysis-pipeline.service";
import { AnalysisTranscriptRepository } from "../../../../worker/src/services/analysis-transcript.repository";
import { AnalysisTranscriptService } from "../../../../worker/src/services/analysis-transcript.service";
import { GeminiClipSelector } from "../../../../worker/src/services/gemini-clip-selector.service";
import { GeminiSummarySelector } from "../../../../worker/src/services/gemini-summary-selector.service";
import { ProcessingLifecycleRepository } from "../../../../worker/src/services/processing-lifecycle.repository";
import { ProcessingLifecycleService } from "../../../../worker/src/services/processing-lifecycle.service";
import {
  TranscriptionAudioExtractionError,
  type TranscriptionAudioExtractor,
} from "../../../../worker/src/services/transcription-audio-extractor.service";
import {
  WhisperTranscriptionError,
  type WhisperTranscriber,
} from "../../../../worker/src/services/whisper-transcriber.service";
import { ProcessingFailureIntentRepository } from "./processing-failure-intent.repository";
import { ProcessingFailureRepository } from "./processing-failure.repository";
import { ProcessingFailureService } from "./processing-failure.service";
import { ProcessingFailureSweeperService } from "./processing-failure-sweeper.service";
import { ProcessingStatusRepository } from "./processing-status.repository";
import { ProcessingStatusService } from "./processing-status.service";
import type { ScopedDatabaseProvider } from "../billing/scoped-database.providers";
import type { DatabaseService } from "../infrastructure/database.service";

const bootstrapUrl = process.env.TEST_DATABASE_BOOTSTRAP_URL;
const migrationUrl = process.env.TEST_DATABASE_MIGRATION_URL;
const runtimeUrl = process.env.TEST_DATABASE_RUNTIME_URL;
const describeIntegration = bootstrapUrl && migrationUrl && runtimeUrl ? describe : describe.skip;
const skippedDatabaseUrl = "postgresql://localhost/postgres";

function withDatabase(url: string | undefined, database: string): string {
  const target = new URL(url ?? skippedDatabaseUrl);
  target.pathname = `/${database}`;
  target.search = "";
  return target.toString();
}

function withRole(url: string | undefined, role: string): string {
  const target = new URL(url ?? skippedDatabaseUrl);
  target.username = role;
  return target.toString();
}

function createClient(connectionString: string): DatabaseClient {
  return createDatabaseClient({ connectionString, poolMax: 2, ssl: false });
}

describeIntegration("paid analysis worker-to-refund recovery", () => {
  const database = `repurposepro_processing_reliability_${randomUUID().replaceAll("-", "")}`;
  const adminClient = createClient(bootstrapUrl ?? skippedDatabaseUrl);
  const migrationClient = createClient(withDatabase(migrationUrl, database));
  const runtimeClient = createClient(withDatabase(runtimeUrl, database));
  const processingClientA = createClient(
    withDatabase(withRole(runtimeUrl, "repurposepro_processing"), database),
  );
  const processingClientB = createClient(
    withDatabase(withRole(runtimeUrl, "repurposepro_processing"), database),
  );
  const checkoutClient = createClient(
    withDatabase(withRole(runtimeUrl, "repurposepro_checkout"), database),
  );
  const webhookClient = createClient(
    withDatabase(withRole(runtimeUrl, "repurposepro_webhook"), database),
  );

  beforeAll(async () => {
    const runtimePassword = decodeURIComponent(new URL(runtimeUrl ?? skippedDatabaseUrl).password);
    await adminClient.pool.query(
      `DO $$
       BEGIN
         IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'repurposepro_checkout') THEN
           CREATE ROLE repurposepro_checkout LOGIN;
         END IF;
         IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'repurposepro_webhook') THEN
           CREATE ROLE repurposepro_webhook LOGIN;
         END IF;
         IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'repurposepro_processing') THEN
           CREATE ROLE repurposepro_processing LOGIN;
         END IF;
       END;
       $$`,
    );
    for (const role of [
      "repurposepro_checkout",
      "repurposepro_webhook",
      "repurposepro_processing",
    ]) {
      const statement = await adminClient.pool.query<{ sql: string }>(
        "SELECT format('ALTER ROLE %I PASSWORD %L', $1::text, $2::text) AS sql",
        [role, runtimePassword],
      );
      await adminClient.pool.query(statement.rows[0]!.sql);
    }
    await adminClient.pool.query(`CREATE DATABASE ${database} OWNER repurposepro_owner`);
    await migrate(migrationClient.db, {
      migrationsFolder: resolve(process.cwd(), "packages/db/drizzle"),
    });
    await migrationClient.pool.query(
      `INSERT INTO users (id, name, email)
       VALUES
         ('reliability-user-a', 'Reliability User A', 'reliability-a@example.test'),
         ('reliability-user-b', 'Reliability User B', 'reliability-b@example.test')`,
    );
    await migrationClient.pool.query(
      `INSERT INTO credit_ledger (user_id, type, amount, description, idempotency_key)
       VALUES
         ('reliability-user-a', 'manual_adjustment', 500, 'Test credits', 'reliability-credit-a'),
         ('reliability-user-b', 'manual_adjustment', 1, 'Insufficient test credit', 'reliability-credit-b')`,
    );
  }, 30_000);

  afterAll(async () => {
    await closeDatabaseClient(runtimeClient);
    await closeDatabaseClient(processingClientA);
    await closeDatabaseClient(processingClientB);
    await closeDatabaseClient(checkoutClient);
    await closeDatabaseClient(webhookClient);
    await closeDatabaseClient(migrationClient);
    await adminClient.pool.query(`DROP DATABASE IF EXISTS ${database} WITH (FORCE)`);
    await closeDatabaseClient(adminClient);
  });

  const failureCases = [
    ["Whisper failure", "whisper", "WHISPER_FAILED", 2, 0],
    ["Whisper timeout", "timeout", "WHISPER_FAILED", 2, 0],
    ["FFmpeg failure", "ffmpeg", "AUDIO_EXTRACTION_FAILED", 2, 0],
    ["Gemini transport", "transport", "GEMINI_FAILED", 1, 3],
    ["invalid AI output", "invalid", "INVALID_AI_OUTPUT", 1, 3],
    ["storage failure", "storage", "STORAGE_FAILED", 2, 0],
    ["preview storage failure", "preview_storage", "STORAGE_FAILED", 1, 3],
    ["unrecoverable worker", "worker", "WORKER_PERMANENT_FAILURE", 0, 0],
  ] as const;

  for (const mode of ["clips", "summary"] as const) {
    it.each(failureCases)(
      mode + " worker %s persists a specific intent and settles once",
      async (_name, scenario, code, transcriptionAttempts, selectionAttempts) => {
        const projectId = await createUploadedProject("reliability-user-a", scenario);
        await migrationClient.pool.query("UPDATE projects SET output_type=$2 WHERE id=$1", [
          projectId,
          mode,
        ]);
        const { jobId } = await startAnalysis(processingClientA, "reliability-user-a", projectId);
        await publishDispatch(processingClientA, "failure-tests", jobId);
        const { processor } = failureProcessor(scenario, mode);
        await expect(
          processor.process({ id: jobId, name: "analyze_video", data: { jobId, projectId } }),
        ).rejects.toThrow();
        const status = new ProcessingStatusService(
          new ProcessingStatusRepository({ database: runtimeClient } as DatabaseService),
        );
        expect(
          (await status.get("reliability-user-a", projectId)).currentJob?.failure,
        ).toMatchObject({ code, refundStatus: "pending", refundedCredits: 0 });
        await expect(status.get("reliability-user-b", projectId)).rejects.toMatchObject({
          code: "PROJECT_NOT_FOUND",
        });
        const before = await migrationClient.pool.query(
          "SELECT stage,attempts FROM analysis_stage_attempts WHERE job_id=$1 ORDER BY stage",
          [jobId],
        );
        expect(before.rows).toEqual([
          {
            stage: "selection",
            attempts: scenario === "preview_storage" && mode === "summary" ? 1 : selectionAttempts,
          },
          { stage: "transcription", attempts: transcriptionAttempts },
        ]);
        // Worker completion writes an intent only; the API owns credit settlement.
        expect(
          (
            await migrationClient.pool.query<{ count: number }>(
              "SELECT COUNT(*)::integer AS count FROM credit_ledger WHERE processing_job_id=$1 AND type='refund'",
              [jobId],
            )
          ).rows[0].count,
        ).toBe(0);
        const provider = { database: processingClientA } as ScopedDatabaseProvider;
        expect((await finalizeFailure(processingClientB, jobId, "USER_CANCELLED")).outcome).toBe(
          "terminal_failure_conflict",
        );
        const intents = new ProcessingFailureIntentRepository(provider);
        const sweeper = new ProcessingFailureSweeperService(
          intents,
          new ProcessingFailureService(new ProcessingFailureRepository(provider)),
        );
        const intentBefore = await migrationClient.pool.query(
          "SELECT status,lease_owner,next_attempt_at<=now() AS due FROM processing_failure_intents WHERE processing_job_id=$1",
          [jobId],
        );
        expect(intentBefore.rows).toEqual([{ status: "pending", lease_owner: null, due: true }]);
        const settled = await sweeper.sweepJob(jobId, "worker-to-refund-test");
        expect(settled).toBe(true);
        expect(await sweeper.sweepJob(jobId, "replay-test")).toBe(false);
        const snapshot = await status.get("reliability-user-a", projectId);
        expect(snapshot.currentJob?.failure).toMatchObject({
          code,
          refundStatus: "completed",
          refundedCredits: 11,
        });
        expect(snapshot.currentJob?.failure?.refundCompletedAt).toBeTruthy();
        expect(
          (
            await migrationClient.pool.query(
              "SELECT type,amount FROM credit_ledger WHERE processing_job_id=$1 ORDER BY amount",
              [jobId],
            )
          ).rows,
        ).toEqual([
          { type: "processing_deduction", amount: -11 },
          { type: "refund", amount: 11 },
        ]);
      },
      15_000,
    );

    it(
      mode + " publishes after a retry, with one charge and no refund",
      async () => {
        const projectId = await createUploadedProject("reliability-user-a", "Retry success");
        await migrationClient.pool.query("UPDATE projects SET output_type=$2 WHERE id=$1", [
          projectId,
          mode,
        ]);
        const { jobId } = await startAnalysis(processingClientA, "reliability-user-a", projectId);
        await publishDispatch(processingClientA, "success-tests", jobId);
        const { processor, extract, generateContent } = failureProcessor("retry_success", mode);
        expect(
          await processor.process({ id: jobId, name: "analyze_video", data: { jobId, projectId } }),
        ).toEqual({ outcome: "preview_ready" });
        expect(extract).toHaveBeenCalledTimes(2);
        expect(generateContent).toHaveBeenCalledTimes(mode === "clips" ? 3 : 1);
        expect((await finalizeFailure(processingClientA, jobId, "WHISPER_FAILED")).outcome).toBe(
          "invalid_job_state",
        );
        expect(
          (
            await migrationClient.pool.query(
              "SELECT type,amount FROM credit_ledger WHERE processing_job_id=$1",
              [jobId],
            )
          ).rows,
        ).toEqual([{ type: "processing_deduction", amount: -11 }]);
        expect(
          (
            await migrationClient.pool.query<{ status: string }>(
              "SELECT status FROM projects WHERE id=$1",
              [projectId],
            )
          ).rows[0].status,
        ).toBe("preview_ready");
      },
      15_000,
    );

    it(
      mode + " recognizes ambiguous committed publication without refunding",
      async () => {
        const projectId = await createUploadedProject(
          "reliability-user-a",
          "Lost publication response",
        );
        await migrationClient.pool.query("UPDATE projects SET output_type=$2 WHERE id=$1", [
          projectId,
          mode,
        ]);
        const { jobId } = await startAnalysis(processingClientA, "reliability-user-a", projectId);
        await publishDispatch(processingClientA, "publication-tests", jobId);
        const { processor } = failureProcessor("ambiguous", mode);
        expect(
          await processor.process({ id: jobId, name: "analyze_video", data: { jobId, projectId } }),
        ).toEqual({ outcome: "preview_ready" });
        expect((await finalizeFailure(processingClientA, jobId, "STORAGE_FAILED")).outcome).toBe(
          "invalid_job_state",
        );
      },
      15_000,
    );
  }

  function failureProcessor(scenario: string, mode: "clips" | "summary") {
    const repository = new AnalysisTranscriptRepository(processingClientA);
    const extract = vi.fn(async () => {
      if (scenario === "ffmpeg") throw new TranscriptionAudioExtractionError("ffmpeg_failed");
      if (scenario === "storage") throw new TranscriptionAudioExtractionError("storage_failed");
      return { outputPath: "unused" };
    });
    let transcriptionCalls = 0;
    const transcribe = vi.fn(async () => {
      transcriptionCalls++;
      if (
        scenario === "whisper" ||
        scenario === "timeout" ||
        (scenario === "retry_success" && transcriptionCalls === 1)
      )
        throw new WhisperTranscriptionError(scenario === "timeout" ? "timeout" : "process_failed");
      return {
        durationSeconds: 600.001,
        language: "en" as const,
        text: "A useful story with a clear beginning and ending.",
        segments: [
          {
            sequence: 0,
            startSeconds: 0,
            endSeconds: 600,
            text: "A useful story with a clear beginning and ending.",
            words: null,
          },
        ],
      };
    });
    const transcripts = new AnalysisTranscriptService(
      repository,
      { extract } as unknown as TranscriptionAudioExtractor,
      { transcribe } as unknown as WhisperTranscriber,
      "small.en",
    );
    const generateContent = vi.fn(async () => {
      if (scenario === "transport") throw new Error("private transport diagnostic");
      if (scenario === "invalid") return { text: "{}" };
      return {
        text: JSON.stringify(
          mode === "summary"
            ? { summarySegments: [{ startTime: 0, endTime: 60, reason: "A clear story" }] }
            : {
                primary: [
                  {
                    startTime: 0,
                    endTime: 30,
                    reason: "Valid partial selection",
                    title: "A story",
                    score: 0.9,
                  },
                ],
                backup: [],
              },
        ),
      };
    });
    const options = { model: "test-model", maxRetries: 2, timeoutMs: 100 };
    if (scenario === "preview_storage" || scenario === "ambiguous") {
      const finalizePreview = repository.finalizePreview.bind(repository);
      const finalizeSummary = repository.finalizeSummary.bind(repository);
      repository.finalizePreview = async (...args) => {
        if (scenario === "ambiguous") await finalizePreview(...args);
        throw new Error("private storage diagnostic");
      };
      repository.finalizeSummary = async (...args) => {
        if (scenario === "ambiguous") await finalizeSummary(...args);
        throw new Error("private storage diagnostic");
      };
    }
    const pipeline = new AnalysisPipelineService(
      repository,
      transcripts,
      new GeminiClipSelector({ generateContent }, options),
      undefined,
      new GeminiSummarySelector({ generateContent }, options),
    );
    const processor = new AnalysisJobProcessor(
      new ProcessingLifecycleService(new ProcessingLifecycleRepository(processingClientA)),
      scenario === "worker"
        ? {
            handle: async () => {
              throw new Error("private worker diagnostic");
            },
          }
        : pipeline,
    );
    return { processor, extract, generateContent };
  }

  async function createUploadedProject(userId: string, name: string): Promise<string> {
    const projectId = randomUUID();
    await migrationClient.pool.query(
      `INSERT INTO projects (id, user_id, name, output_type, status)
       VALUES ($1, $2, $3, 'clips', 'uploaded')`,
      [projectId, userId, name],
    );
    await migrationClient.pool.query(
      `INSERT INTO uploaded_videos (
        project_id, original_file_name, storage_path, mime_type, file_size_bytes,
        duration_seconds, width, height, has_audio, expires_at
      )
      VALUES ($1, $2, $3, 'video/mp4', 1024, 600.001, 1920, 1080, true, now() + interval '7 days')`,
      [projectId, `${projectId}.mp4`, `/private/${projectId}.mp4`],
    );
    return projectId;
  }

  async function startAnalysis(
    client: DatabaseClient,
    userId: string,
    projectId: string,
  ): Promise<{
    creditsCharged: number;
    jobId: string;
    outcome: string;
  }> {
    const result = await client.pool.query<{
      creditsCharged: number;
      jobId: string;
      outcome: string;
    }>(
      `SELECT
        outcome,
        job_id AS "jobId",
        credits_charged AS "creditsCharged"
       FROM public.start_paid_video_analysis($1, $2)`,
      [userId, projectId],
    );
    return result.rows[0]!;
  }

  async function claimDispatch(
    client: DatabaseClient,
    dispatcherId: string,
    jobId: string,
  ): Promise<
    | {
        dispatchId: string;
        jobId: string;
        leaseToken: string;
        projectId: string;
      }
    | undefined
  > {
    const result = await client.pool.query<{
      dispatchId: string;
      jobId: string;
      leaseToken: string;
      projectId: string;
    }>(
      `SELECT
         dispatch_id AS "dispatchId",
         job_id AS "jobId",
         lease_token AS "leaseToken",
         project_id AS "projectId"
       FROM public.claim_pending_analysis_dispatch($1, $2)`,
      [dispatcherId, jobId],
    );
    return result.rows[0];
  }

  async function publishDispatch(
    client: DatabaseClient,
    dispatcherId: string,
    jobId: string,
  ): Promise<void> {
    const claim = await claimDispatch(client, dispatcherId, jobId);
    expect(claim).toBeDefined();
    await client.pool.query("SELECT public.mark_analysis_dispatch_published($1, $2, $3)", [
      claim!.dispatchId,
      claim!.leaseToken,
      jobId,
    ]);
  }

  async function finalizeFailure(
    client: DatabaseClient,
    jobId: string,
    failureCode: string,
  ): Promise<{ outcome: string; refundedCredits: number }> {
    const result = await client.pool.query<{
      outcome: string;
      refundedCredits: number;
    }>(
      `SELECT outcome, refunded_credits AS "refundedCredits"
       FROM public.finalize_failed_processing_job($1, $2, $3)`,
      [jobId, failureCode, "Processing failed before a usable result was produced."],
    );
    return result.rows[0]!;
  }
});
