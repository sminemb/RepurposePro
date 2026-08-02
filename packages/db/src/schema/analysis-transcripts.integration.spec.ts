import { randomUUID } from "node:crypto";
import { resolve } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  closeDatabaseClient,
  createDatabaseClient,
  migrateDatabaseForTests,
  type DatabaseClient,
} from "../index";

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

async function formatDatabaseStatement(
  admin: DatabaseClient,
  template: string,
  database: string,
): Promise<string> {
  const result = await admin.pool.query<{ sql: string }>(
    "SELECT format($1::text, $2::text) AS sql",
    [template, database],
  );
  return result.rows[0]!.sql;
}

describeIntegration("analysis transcript persistence", () => {
  const database = `repurposepro_transcripts_${randomUUID().replaceAll("-", "")}`;
  const admin = client(bootstrapUrl ?? skippedDatabaseUrl);
  const owner = client(withDatabase(migrationUrl, database));
  const processing = client(
    withDatabase(withRole(runtimeUrl, "repurposepro_processing"), database),
  );
  const runtime = client(withDatabase(runtimeUrl, database));
  const projectId = randomUUID();
  const videoId = randomUUID();
  const jobId = randomUUID();
  const leaseToken = randomUUID();
  const rejectedJobId = randomUUID();
  const rejectedLeaseToken = randomUUID();
  const rejectedProjectId = randomUUID();
  const rejectedVideoId = randomUUID();

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
    await admin.pool.query(
      await formatDatabaseStatement(admin, "CREATE DATABASE %I OWNER repurposepro_owner", database),
    );
    await migrateDatabaseForTests(owner, resolve(process.cwd(), "packages/db/drizzle"));
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
    await closeDatabaseClient(runtime);
    await closeDatabaseClient(processing);
    await closeDatabaseClient(owner);
    await admin.pool.query(
      await formatDatabaseStatement(admin, "DROP DATABASE IF EXISTS %I WITH (FORCE)", database),
    );
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

  it("atomically finalizes durable primary and backup candidates", async () => {
    const candidates = [
      {
        captionLines: [{ endTime: 15, startTime: 0, text: "A useful opening." }],
        captionPosition: { x: 0.5, y: 0.72 },
        captionStyle: "hormozi",
        captionsEnabled: true,
        crop: null,
        endTime: 15,
        kind: "primary",
        previewFontSize: 48,
        rank: 0,
        reason: "Clear hook.",
        score: 0.9,
        startTime: 0,
        title: "Opening",
      },
      {
        captionLines: [{ endTime: 30, startTime: 15, text: "A useful ending." }],
        captionPosition: { x: 0.5, y: 0.72 },
        captionStyle: "hormozi",
        captionsEnabled: true,
        crop: null,
        endTime: 30,
        kind: "backup",
        previewFontSize: 48,
        rank: 0,
        reason: "Complete takeaway.",
        score: 0.8,
        startTime: 15,
        title: "Ending",
      },
    ];
    const finalize = (token = leaseToken) =>
      processing.pool.query<{ outcome: string }>(
        "SELECT finalize_analysis_preview($1, 'worker-test', $2, 'clips-v1', $3::jsonb) AS outcome",
        [jobId, token, JSON.stringify(candidates)],
      );

    await expect(finalize()).resolves.toMatchObject({ rows: [{ outcome: "created" }] });
    await expect(finalize(randomUUID())).resolves.toMatchObject({
      rows: [{ outcome: "existing" }],
    });
    await expect(
      processing.pool.query("SELECT is_analysis_preview_ready($1, $2) AS ready", [
        jobId,
        projectId,
      ]),
    ).resolves.toMatchObject({ rows: [{ ready: true }] });
    await expect(
      owner.pool.query(
        `SELECT
          job.status,
          job.step,
          job.progress,
          job.analysis_prompt_version AS "promptVersion",
          job.execution_lease_token AS "leaseToken",
          project.status AS "projectStatus",
          count(candidate.id)::integer AS candidates,
          count(candidate.id) FILTER (WHERE candidate.kind = 'backup')::integer AS backups
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
          backups: 1,
          candidates: 2,
          leaseToken: null,
          progress: 100,
          projectStatus: "preview_ready",
          promptVersion: "clips-v1",
          status: "completed",
          step: "preview_ready",
        },
      ],
    });
    await expect(
      processing.pool.query("SELECT id FROM clip_candidates LIMIT 1"),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("exposes only owner-scoped primary preview JSON to the API role", async () => {
    const owned = await runtime.pool.query<{
      clips: Array<Record<string, unknown>>;
      project_id: string;
      source_duration_seconds: string;
    }>("SELECT * FROM list_owned_project_clip_candidates($1, $2)", ["transcript-user", projectId]);
    expect(owned.rows).toHaveLength(1);
    expect(owned.rows[0]?.clips).toHaveLength(1);
    expect(owned.rows[0]?.clips[0]).toMatchObject({ rank: 0, title: "Opening" });
    expect(owned.rows[0]?.clips[0]).not.toHaveProperty("kind");
    expect(owned.rows[0]?.clips[0]).not.toHaveProperty("reason");
    expect(owned.rows[0]?.clips[0]).not.toHaveProperty("storagePath");
    await expect(
      runtime.pool.query("SELECT * FROM list_owned_project_clip_candidates($1, $2)", [
        "other-user",
        projectId,
      ]),
    ).resolves.toMatchObject({ rows: [] });
    await expect(
      runtime.pool.query("SELECT * FROM get_owned_source_video_content($1, $2)", [
        "transcript-user",
        projectId,
      ]),
    ).resolves.toMatchObject({
      rows: [
        {
          file_size_bytes: "1000",
          mime_type: "video/mp4",
          storage_path: "D:/storage/source.mp4",
        },
      ],
    });
    await expect(
      runtime.pool.query("SELECT * FROM get_owned_source_video_content($1, $2)", [
        "other-user",
        projectId,
      ]),
    ).resolves.toMatchObject({ rows: [] });
    await expect(
      runtime.pool.query("SELECT id FROM clip_candidates LIMIT 1"),
    ).rejects.toMatchObject({ code: "42501" });
    await expect(
      processing.pool.query("SELECT * FROM list_owned_project_clip_candidates($1, $2)", [
        "transcript-user",
        projectId,
      ]),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("fences invalid preview finalization without partially changing state", async () => {
    await owner.pool.query(
      `INSERT INTO projects (id, user_id, name, output_type, status)
       VALUES ($1, 'transcript-user', 'Rejected Preview', 'clips', 'transcribing')`,
      [rejectedProjectId],
    );
    await owner.pool.query(
      `INSERT INTO uploaded_videos (
         id, project_id, original_file_name, storage_path, mime_type, file_size_bytes,
         duration_seconds, width, height, has_audio, expires_at
       ) VALUES ($2, $1, 'rejected.mp4', 'D:/storage/rejected.mp4', 'video/mp4', 1000,
         30, 1920, 1080, true, now() + interval '1 day')`,
      [rejectedProjectId, rejectedVideoId],
    );
    await owner.pool.query(
      `INSERT INTO processing_jobs (
         id, project_id, user_id, type, status, step, progress, credits_charged,
         execution_lease_token, execution_lease_owner, execution_lease_expires_at,
         execution_heartbeat_at
       ) VALUES ($2, $1, 'transcript-user', 'analyze_video', 'active', 'transcribing', 45, 1,
         $3, 'worker-test', now() + interval '1 hour', now())`,
      [rejectedProjectId, rejectedJobId, rejectedLeaseToken],
    );
    await owner.pool.query("UPDATE projects SET current_job_id = $2 WHERE id = $1", [
      rejectedProjectId,
      rejectedJobId,
    ]);
    const segments = [
      {
        endSeconds: 15,
        sequence: 0,
        startSeconds: 0,
        text: "A rejected candidate source.",
        words: null,
      },
    ];
    await processing.pool.query(
      `SELECT outcome
       FROM persist_analysis_transcript(
         $1, 'worker-test', $2, 'en', 'small.en', 30, 'A rejected candidate source.', $3::jsonb
       )`,
      [rejectedJobId, rejectedLeaseToken, JSON.stringify(segments)],
    );
    const candidate = {
      captionLines: [{ endTime: 15, startTime: 0, text: "Candidate caption." }],
      captionPosition: { x: 0.5, y: 0.72 },
      captionStyle: "hormozi",
      captionsEnabled: true,
      crop: null,
      endTime: 15,
      kind: "primary",
      previewFontSize: 48,
      rank: 0,
      reason: "Candidate reason.",
      score: 0.9,
      startTime: 0,
      title: "Candidate",
    };
    const invalidCandidateSets = [
      [
        {
          ...candidate,
          captionLines: [{ endTime: 31, startTime: 0, text: "Outside the source." }],
          endTime: 31,
        },
      ],
      [{ ...candidate, captionLines: null }],
      [{ ...candidate, captionPosition: null }],
      [{ ...candidate, captionPosition: { x: "0.5", y: 0.72 } }],
      [{ ...candidate, crop: { height: 1, width: 1, x: "0", y: 0 } }],
    ];

    for (const invalidCandidates of invalidCandidateSets) {
      const session = await processing.pool.connect();
      try {
        await session.query("BEGIN");
        await expect(
          session.query(
            "SELECT finalize_analysis_preview($1, 'worker-test', $2, 'clips-v1', $3::jsonb)",
            [rejectedJobId, rejectedLeaseToken, JSON.stringify(invalidCandidates)],
          ),
        ).rejects.toMatchObject({ code: "23514" });
      } finally {
        await session.query("ROLLBACK");
        session.release();
      }
    }
    await expect(
      processing.pool.query(
        "SELECT finalize_analysis_preview($1, 'worker-test', $2, 'clips-v1', '[]'::jsonb) AS outcome",
        [rejectedJobId, randomUUID()],
      ),
    ).resolves.toMatchObject({ rows: [{ outcome: "lost" }] });
    await expect(
      owner.pool.query(
        `SELECT
          job.status,
          job.step,
          job.progress,
          job.analysis_prompt_version AS "promptVersion",
          count(candidate.id)::integer AS candidates
         FROM processing_jobs AS job
         LEFT JOIN clip_candidates AS candidate ON candidate.processing_job_id = job.id
         WHERE job.id = $1
         GROUP BY job.id`,
        [rejectedJobId],
      ),
    ).resolves.toMatchObject({
      rows: [
        {
          candidates: 0,
          progress: 45,
          promptVersion: null,
          status: "active",
          step: "transcribing",
        },
      ],
    });
  });
});
