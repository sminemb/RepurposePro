import { randomUUID } from "node:crypto";
import { resolve } from "node:path";

import { closeDatabaseClient, createDatabaseClient, type DatabaseClient } from "@repurposepro/db";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

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

describeIntegration("processing dispatch and automatic refund reliability", () => {
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
         ('reliability-user-a', 'manual_adjustment', 100, 'Test credits', 'reliability-credit-a'),
         ('reliability-user-b', 'manual_adjustment', 1, 'Insufficient test credit', 'reliability-credit-b')`,
    );
  }, 30_000);

  afterAll(async () => {
    await closeDatabaseClient(runtimeClient);
    await closeDatabaseClient(processingClientA);
    await closeDatabaseClient(processingClientB);
    await closeDatabaseClient(migrationClient);
    await adminClient.pool.query(`DROP DATABASE IF EXISTS ${database} WITH (FORCE)`);
    await closeDatabaseClient(adminClient);
  });

  it("creates one deduction, job, and pending dispatch for duplicate paid starts", async () => {
    const projectId = await createUploadedProject("reliability-user-a", "Duplicate start");

    const first = await startAnalysis(processingClientA, "reliability-user-a", projectId);
    const second = await startAnalysis(processingClientA, "reliability-user-a", projectId);
    const counts = await migrationClient.pool.query<{
      deductions: string;
      dispatches: string;
      jobs: string;
    }>(
      `SELECT
        (SELECT COUNT(*)::text FROM processing_jobs WHERE project_id = $1) AS jobs,
        (SELECT COUNT(*)::text FROM credit_ledger WHERE processing_job_id = $2
          AND type = 'processing_deduction') AS deductions,
        (SELECT COUNT(*)::text FROM processing_job_dispatches WHERE processing_job_id = $2)
          AS dispatches`,
      [projectId, first.jobId],
    );

    expect(first).toMatchObject({ outcome: "created", creditsCharged: 11 });
    expect(second).toMatchObject({ outcome: "existing", jobId: first.jobId });
    expect(counts.rows).toEqual([{ deductions: "1", dispatches: "1", jobs: "1" }]);
    await expect(
      migrationClient.pool.query(
        `SELECT status, published_at
         FROM processing_job_dispatches
         WHERE processing_job_id = $1`,
        [first.jobId],
      ),
    ).resolves.toMatchObject({ rows: [{ published_at: null, status: "pending" }] });
  });

  it("creates no job, deduction, or dispatch when credits are insufficient", async () => {
    const projectId = await createUploadedProject("reliability-user-b", "Insufficient");

    await expect(
      startAnalysis(processingClientA, "reliability-user-b", projectId),
    ).resolves.toMatchObject({ outcome: "insufficient_credits" });
    await expect(
      migrationClient.pool.query(
        `SELECT
          (SELECT COUNT(*)::integer FROM processing_jobs WHERE project_id = $1) AS jobs,
          (SELECT COUNT(*)::integer FROM credit_ledger WHERE project_id = $1) AS ledger,
          (SELECT COUNT(*)::integer
             FROM processing_job_dispatches AS dispatch
             JOIN processing_jobs AS job ON job.id = dispatch.processing_job_id
            WHERE job.project_id = $1) AS dispatches`,
        [projectId],
      ),
    ).resolves.toMatchObject({ rows: [{ dispatches: 0, jobs: 0, ledger: 0 }] });
  });

  it("does not let another user start processing for an owned project", async () => {
    const projectId = await createUploadedProject("reliability-user-a", "Ownership isolation");

    await expect(
      startAnalysis(processingClientA, "reliability-user-b", projectId),
    ).resolves.toMatchObject({ outcome: "project_not_found" });
    await expect(
      migrationClient.pool.query(
        `SELECT
          (SELECT COUNT(*)::integer FROM processing_jobs WHERE project_id = $1) AS jobs,
          (SELECT COUNT(*)::integer FROM credit_ledger WHERE project_id = $1) AS ledger,
          (SELECT COUNT(*)::integer
             FROM processing_job_dispatches AS dispatch
             JOIN processing_jobs AS job ON job.id = dispatch.processing_job_id
            WHERE job.project_id = $1) AS dispatches`,
        [projectId],
      ),
    ).resolves.toMatchObject({ rows: [{ dispatches: 0, jobs: 0, ledger: 0 }] });
  });

  it("lets concurrent dispatchers claim a pending charged job only once", async () => {
    const projectId = await createUploadedProject("reliability-user-a", "Concurrent dispatch");
    const started = await startAnalysis(processingClientA, "reliability-user-a", projectId);

    const claims = await Promise.all([
      claimDispatch(processingClientA, "dispatcher-a", started.jobId),
      claimDispatch(processingClientB, "dispatcher-b", started.jobId),
    ]);

    expect(claims.filter((claim) => claim !== undefined)).toHaveLength(1);
    expect(claims.find((claim) => claim !== undefined)).toMatchObject({
      jobId: started.jobId,
      projectId,
    });
  });

  it("restores exact credits once across concurrent eligible refund retries", async () => {
    const projectId = await createUploadedProject("reliability-user-a", "Concurrent refund");
    const started = await startAnalysis(processingClientA, "reliability-user-a", projectId);

    const refunds = await Promise.all([
      finalizeFailure(processingClientA, started.jobId, "ANALYSIS_RETRIES_EXHAUSTED"),
      finalizeFailure(processingClientB, started.jobId, "ANALYSIS_RETRIES_EXHAUSTED"),
    ]);
    const state = await migrationClient.pool.query<{
      jobStatus: string;
      projectStatus: string;
      refundAmount: number;
      refundCount: string;
    }>(
      `SELECT
        job.status::text AS "jobStatus",
        project.status::text AS "projectStatus",
        COALESCE(SUM(ledger.amount) FILTER (WHERE ledger.type = 'refund'), 0)::integer
          AS "refundAmount",
        COUNT(*) FILTER (WHERE ledger.type = 'refund')::text AS "refundCount"
       FROM processing_jobs AS job
       JOIN projects AS project ON project.id = job.project_id
       LEFT JOIN credit_ledger AS ledger ON ledger.processing_job_id = job.id
       WHERE job.id = $1
       GROUP BY job.status, project.status`,
      [started.jobId],
    );

    expect(refunds.map((refund) => refund.outcome).sort()).toEqual([
      "already_refunded",
      "refunded",
    ]);
    expect(state.rows).toEqual([
      {
        jobStatus: "refunded",
        projectStatus: "refunded",
        refundAmount: 11,
        refundCount: "1",
      },
    ]);
  });

  it("marks an ineligible terminal failure without creating a refund", async () => {
    const projectId = await createUploadedProject("reliability-user-a", "No refund");
    const started = await startAnalysis(processingClientA, "reliability-user-a", projectId);

    await expect(
      finalizeFailure(processingClientA, started.jobId, "USER_CANCELLED"),
    ).resolves.toEqual({ outcome: "failed_no_refund", refundedCredits: 0 });
    await expect(
      migrationClient.pool.query(
        `SELECT COUNT(*)::integer AS count
         FROM credit_ledger
         WHERE processing_job_id = $1 AND type = 'refund'`,
        [started.jobId],
      ),
    ).resolves.toMatchObject({ rows: [{ count: 0 }] });
  });

  it("rejects a refund when the project no longer owns the charged current job", async () => {
    const projectId = await createUploadedProject("reliability-user-a", "Refund ownership");
    const started = await startAnalysis(processingClientA, "reliability-user-a", projectId);

    await migrationClient.pool.query(`UPDATE projects SET current_job_id = NULL WHERE id = $1`, [
      projectId,
    ]);

    await expect(
      finalizeFailure(processingClientA, started.jobId, "ANALYSIS_RETRIES_EXHAUSTED"),
    ).rejects.toThrow(/project ownership/i);
    await expect(
      migrationClient.pool.query(
        `SELECT
          job.status::text AS "jobStatus",
          COUNT(*) FILTER (WHERE ledger.type = 'refund')::integer AS refunds
         FROM processing_jobs AS job
         LEFT JOIN credit_ledger AS ledger ON ledger.processing_job_id = job.id
         WHERE job.id = $1
         GROUP BY job.status`,
        [started.jobId],
      ),
    ).resolves.toMatchObject({ rows: [{ jobStatus: "queued", refunds: 0 }] });
  });

  it("denies generic runtime callers access to dispatch and refund operations", async () => {
    await expect(
      runtimeClient.pool.query("SELECT * FROM public.claim_pending_analysis_dispatch($1, NULL)", [
        "foreign-runtime",
      ]),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      runtimeClient.pool.query("SELECT * FROM public.finalize_failed_processing_job($1, $2, $3)", [
        "00000000-0000-4000-8000-000000000799",
        "ANALYSIS_RETRIES_EXHAUSTED",
        "Safe message.",
      ]),
    ).rejects.toThrow(/permission denied/i);
  });

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
  ): Promise<{ jobId: string; projectId: string } | undefined> {
    const result = await client.pool.query<{ jobId: string; projectId: string }>(
      `SELECT job_id AS "jobId", project_id AS "projectId"
       FROM public.claim_pending_analysis_dispatch($1, $2)`,
      [dispatcherId, jobId],
    );
    return result.rows[0];
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
