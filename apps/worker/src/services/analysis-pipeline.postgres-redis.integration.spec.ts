import { randomUUID } from "node:crypto";
import { resolve } from "node:path";

import {
  closeDatabaseClient,
  createDatabaseClient,
  migrateDatabaseForTests,
  type DatabaseClient,
} from "@repurposepro/db";
import { ANALYZE_VIDEO_JOB_NAME, VIDEO_ANALYSIS_QUEUE_NAME } from "@repurposepro/shared";
import { Queue, QueueEvents } from "bullmq";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AnalysisJobProcessor } from "../processors/analysis-job.processor";
import { AnalysisPipelineService } from "./analysis-pipeline.service";
import { AnalysisQueueConsumerService } from "./analysis-queue-consumer.service";
import { AnalysisTranscriptRepository } from "./analysis-transcript.repository";
import type { AnalysisTranscriptService } from "./analysis-transcript.service";
import type { GeminiClipSelector } from "./gemini-clip-selector.service";
import { ProcessingLifecycleRepository } from "./processing-lifecycle.repository";
import { ProcessingLifecycleService } from "./processing-lifecycle.service";

const bootstrapUrl = process.env.TEST_DATABASE_BOOTSTRAP_URL;
const migrationUrl = process.env.TEST_DATABASE_MIGRATION_URL;
const runtimeUrl = process.env.TEST_DATABASE_RUNTIME_URL;
const redisUrl = process.env.TEST_REDIS_URL;
const describeIntegration =
  bootstrapUrl && migrationUrl && runtimeUrl && redisUrl ? describe : describe.skip;
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

function client(connectionString: string): DatabaseClient {
  return createDatabaseClient({ connectionString, poolMax: 3, ssl: false });
}

describeIntegration("analysis PostgreSQL/Redis mock-AI flow", () => {
  const databaseName = `repurposepro_mock_ai_${randomUUID().replaceAll("-", "")}`;
  const admin = client(bootstrapUrl ?? skippedDatabaseUrl);
  const owner = client(withDatabase(migrationUrl, databaseName));
  const processing = client(
    withDatabase(withRole(runtimeUrl, "repurposepro_processing"), databaseName),
  );
  const jobId = randomUUID();
  const projectId = randomUUID();
  const transcriptId = randomUUID();
  const userId = `mock-ai-${randomUUID()}`;
  const videoId = randomUUID();

  beforeAll(async () => {
    const runtimePassword = decodeURIComponent(new URL(runtimeUrl ?? skippedDatabaseUrl).password);
    await admin.pool.query(
      `DO $$
       BEGIN
         IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'repurposepro_processing') THEN
           CREATE ROLE repurposepro_processing LOGIN;
         END IF;
       END;
       $$`,
    );
    const passwordStatement = await admin.pool.query<{ sql: string }>(
      "SELECT format('ALTER ROLE %I PASSWORD %L', $1::text, $2::text) AS sql",
      ["repurposepro_processing", runtimePassword],
    );
    await admin.pool.query(passwordStatement.rows[0]!.sql);
    await admin.pool.query(`CREATE DATABASE ${databaseName} OWNER repurposepro_owner`);
    await migrateDatabaseForTests(owner, resolve(process.cwd(), "packages/db/drizzle"));
    await owner.pool.query("INSERT INTO users (id, name, email) VALUES ($1, 'Mock AI', $2)", [
      userId,
      `${userId}@example.test`,
    ]);
    await owner.pool.query(
      `INSERT INTO projects (id, user_id, name, output_type, status)
       VALUES ($1, $2, 'Mock AI Flow', 'clips', 'queued')`,
      [projectId, userId],
    );
    await owner.pool.query(
      `INSERT INTO uploaded_videos (
         id, project_id, original_file_name, storage_path, mime_type, file_size_bytes,
         duration_seconds, width, height, has_audio, expires_at
       ) VALUES ($2, $1, 'source.mp4', 'storage/mock-ai.mp4', 'video/mp4', 1000,
         30, 1920, 1080, true, now() + interval '1 day')`,
      [projectId, videoId],
    );
    await owner.pool.query(
      `INSERT INTO processing_jobs (
         id, project_id, user_id, type, status, step, progress, credits_charged, bullmq_job_id
       ) VALUES ($2, $1, $3, 'analyze_video', 'queued', 'queued', 0, 1, $4)`,
      [projectId, jobId, userId, jobId],
    );
    await owner.pool.query("UPDATE projects SET current_job_id = $2 WHERE id = $1", [
      projectId,
      jobId,
    ]);
    await owner.pool.query(
      `INSERT INTO credit_ledger (
         user_id, project_id, processing_job_id, type, amount, description, idempotency_key
       ) VALUES ($1, $2, $3, 'processing_deduction', -1, 'Mock AI analysis', $4)`,
      [userId, projectId, jobId, `mock-ai-deduction-${jobId}`],
    );
    await owner.pool.query(
      `UPDATE processing_job_dispatches
       SET status = 'published', bullmq_job_id = $2, published_at = now()
       WHERE processing_job_id = $1`,
      [jobId, jobId],
    );
    await owner.pool.query(
      `INSERT INTO transcripts (
         id, project_id, processing_job_id, uploaded_video_id, language, model,
         duration_seconds, text
       ) VALUES ($1, $2, $3, $4, 'en', 'mock-whisper', 30, 'A useful hook and conclusion.')`,
      [transcriptId, projectId, jobId, videoId],
    );
    await owner.pool.query(
      `INSERT INTO transcript_segments (
         transcript_id, sequence, start_seconds, end_seconds, text, words
       ) VALUES ($1, 0, 0, 15, 'A useful hook and conclusion.', NULL)`,
      [transcriptId],
    );
  }, 30_000);

  afterAll(async () => {
    await closeDatabaseClient(processing);
    await closeDatabaseClient(owner);
    await admin.pool.query(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`);
    await closeDatabaseClient(admin);
  });

  it("consumes a retained BullMQ job and atomically exposes a durable preview", async () => {
    const prefix = `repurposepro-mock-ai-${randomUUID()}`;
    const lifecycle = new ProcessingLifecycleService(
      new ProcessingLifecycleRepository(processing),
      {
        heartbeatIntervalMs: 15_000,
        heartbeatRetryMs: 1_000,
        leaseLifetimeMs: 60_000,
        leaseSafetyMs: 1_000,
      },
    );
    const repository = new AnalysisTranscriptRepository(processing);
    const transcript = {
      durationSeconds: 30,
      id: transcriptId,
      language: "en" as const,
      model: "mock-whisper",
      segments: [
        {
          endSeconds: 15,
          sequence: 0,
          startSeconds: 0,
          text: "A useful hook and conclusion.",
          words: null,
        },
      ],
      text: "A useful hook and conclusion.",
    };
    const transcriptService = {
      getOrCreate: async (
        _jobId: string,
        context: { updateProgress: (step: string, value: number) => Promise<void> },
      ) => {
        await context.updateProgress("extracting_audio", 25);
        await context.updateProgress("transcribing", 45);
        return { sourceDurationSeconds: 30, transcript };
      },
    } as unknown as AnalysisTranscriptService;
    const selector = {
      select: async () => ({
        backup: [],
        primary: [
          {
            endTime: 15,
            reason: "A complete useful idea.",
            score: 0.9,
            startTime: 0,
            title: "Useful hook",
          },
        ],
        promptVersion: "clips-v1",
      }),
    } as unknown as GeminiClipSelector;
    const pipeline = new AnalysisPipelineService(repository, transcriptService, selector);
    const processor = new AnalysisJobProcessor(lifecycle, pipeline, {
      createExecutionId: () => "worker-mock-ai",
    });
    const consumer = new AnalysisQueueConsumerService(processor, {
      prefix,
      redisUrl: redisUrl!,
    });
    const redis = new URL(redisUrl!);
    const connection = {
      host: redis.hostname,
      maxRetriesPerRequest: null,
      password: redis.password ? decodeURIComponent(redis.password) : undefined,
      port: Number(redis.port || 6379),
      username: redis.username ? decodeURIComponent(redis.username) : undefined,
    };
    const queue = new Queue(VIDEO_ANALYSIS_QUEUE_NAME, {
      connection,
      prefix,
    });
    const events = new QueueEvents(VIDEO_ANALYSIS_QUEUE_NAME, {
      connection,
      prefix,
    });

    try {
      await events.waitUntilReady();
      await consumer.onModuleInit();
      const job = await queue.add(
        ANALYZE_VIDEO_JOB_NAME,
        { jobId, projectId },
        { jobId, removeOnComplete: false, removeOnFail: false },
      );
      await expect(job.waitUntilFinished(events, 15_000)).resolves.toEqual({
        outcome: "preview_ready",
      });
      await expect(queue.getJob(jobId)).resolves.not.toBeUndefined();
      await expect(
        owner.pool.query(
          `SELECT
             job.status,
             job.step,
             job.progress,
             project.status AS project_status,
             count(candidate.id)::integer AS candidates
           FROM processing_jobs AS job
           JOIN projects AS project ON project.id = job.project_id
           JOIN clip_candidates AS candidate ON candidate.processing_job_id = job.id
           WHERE job.id = $1
           GROUP BY job.id, project.id`,
          [jobId],
        ),
      ).resolves.toMatchObject({
        rows: [
          {
            candidates: 1,
            progress: 100,
            project_status: "preview_ready",
            status: "completed",
            step: "preview_ready",
          },
        ],
      });
    } finally {
      await consumer.onModuleDestroy();
      await queue.obliterate({ force: true });
      await events.close();
      await queue.close();
    }
  }, 30_000);
});
