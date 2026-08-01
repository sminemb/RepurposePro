import { randomUUID } from "node:crypto";
import { resolve } from "node:path";

import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { closeDatabaseClient, createDatabaseClient, type DatabaseClient } from "../index";

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

function client(connectionString: string): DatabaseClient {
  return createDatabaseClient({ connectionString, poolMax: 2, ssl: false });
}

describeIntegration("analysis transcript persistence", () => {
  const database = `repurposepro_transcripts_${randomUUID().replaceAll("-", "")}`;
  const admin = client(bootstrapUrl ?? skippedDatabaseUrl);
  const owner = client(withDatabase(migrationUrl, database));
  const processing = client(
    withDatabase(withRole(runtimeUrl, "repurposepro_processing"), database),
  );
  const projectId = randomUUID();
  const videoId = randomUUID();
  const jobId = randomUUID();
  const leaseToken = randomUUID();

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
    await admin.pool.query(`CREATE DATABASE ${database} OWNER repurposepro_owner`);
    await migrate(owner.db, { migrationsFolder: resolve(process.cwd(), "packages/db/drizzle") });
    await owner.pool.query(
      `INSERT INTO users (id, name, email)
       VALUES ('transcript-user', 'Transcript User', 'transcript@example.test')`,
    );
    await owner.pool.query(
      `INSERT INTO projects (id, user_id, name, output_type, status)
       VALUES ($1, 'transcript-user', 'Transcript Project', 'clips', 'transcribing')`,
      [projectId],
    );
    await owner.pool.query(
      `INSERT INTO uploaded_videos (
         id, project_id, original_file_name, storage_path, mime_type, file_size_bytes,
         duration_seconds, width, height, has_audio, expires_at
       ) VALUES ($2, $1, 'source.mp4', 'D:/storage/source.mp4', 'video/mp4', 1000,
         30, 1920, 1080, true, now() + interval '1 day')`,
      [projectId, videoId],
    );
    await owner.pool.query(
      `INSERT INTO processing_jobs (
         id, project_id, user_id, type, status, step, progress, credits_charged,
         execution_lease_token, execution_lease_owner, execution_lease_expires_at,
         execution_heartbeat_at
       ) VALUES ($2, $1, 'transcript-user', 'analyze_video', 'active', 'transcribing', 45, 1,
         $3, 'worker-test', now() + interval '1 hour', now())`,
      [projectId, jobId, leaseToken],
    );
    await owner.pool.query("UPDATE projects SET current_job_id = $2 WHERE id = $1", [
      projectId,
      jobId,
    ]);
  }, 30_000);

  afterAll(async () => {
    await closeDatabaseClient(processing);
    await closeDatabaseClient(owner);
    await admin.pool.query(`DROP DATABASE IF EXISTS ${database} WITH (FORCE)`);
    await closeDatabaseClient(admin);
  });

  it("fences source lookup and exposes no direct table access", async () => {
    await expect(
      processing.pool.query(
        `SELECT outcome, project_id, source_path, source_duration_seconds, transcript
         FROM get_analysis_transcription_context($1, 'worker-test', $2)`,
        [jobId, leaseToken],
      ),
    ).resolves.toMatchObject({
      rows: [
        {
          outcome: "ready",
          project_id: projectId,
          source_duration_seconds: "30.000",
          source_path: "D:/storage/source.mp4",
          transcript: null,
        },
      ],
    });

    await expect(processing.pool.query("SELECT id FROM transcripts LIMIT 1")).rejects.toMatchObject(
      { code: "42501" },
    );
    await expect(
      processing.pool.query(
        "SELECT outcome FROM get_analysis_transcription_context($1, 'other-worker', $2)",
        [jobId, leaseToken],
      ),
    ).resolves.toMatchObject({ rows: [{ outcome: "lost" }] });
  });

  it("persists once, reuses on retry, and returns ordered segments", async () => {
    const segments = [
      {
        endSeconds: 4.5,
        sequence: 0,
        startSeconds: 1.25,
        text: "A useful opening.",
        words: null,
      },
    ];
    const persist = () =>
      processing.pool.query<{ outcome: string; transcript_id: string }>(
        `SELECT outcome, transcript_id
         FROM persist_analysis_transcript(
           $1, 'worker-test', $2, 'en', 'small.en', 30, 'A useful opening.', $3::jsonb
         )`,
        [jobId, leaseToken, JSON.stringify(segments)],
      );

    await expect(persist()).resolves.toMatchObject({ rows: [{ outcome: "created" }] });
    await expect(persist()).resolves.toMatchObject({ rows: [{ outcome: "reused" }] });
    await expect(
      owner.pool.query(
        `SELECT
          (SELECT count(*)::integer FROM transcripts WHERE processing_job_id = $1) AS transcripts,
          (SELECT count(*)::integer FROM transcript_segments AS segment
            JOIN transcripts AS transcript_record ON transcript_record.id = segment.transcript_id
            WHERE transcript_record.processing_job_id = $1) AS segments`,
        [jobId],
      ),
    ).resolves.toMatchObject({ rows: [{ segments: 1, transcripts: 1 }] });
    const context = await processing.pool.query<{ outcome: string; transcript: unknown }>(
      `SELECT outcome, transcript
       FROM get_analysis_transcription_context($1, 'worker-test', $2)`,
      [jobId, leaseToken],
    );
    expect(context.rows[0]).toMatchObject({
      outcome: "transcript_ready",
      transcript: { segments, text: "A useful opening." },
    });
  });
});
