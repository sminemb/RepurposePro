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

  it("fences two concurrent workers and keeps same-owner acquisition idempotent", async () => {
    const projectId = await createUploadedProject("reliability-user-a", "Worker contention");
    const started = await startAnalysis(processingClientA, "reliability-user-a", projectId);
    await publishDispatch(processingClientA, "dispatcher-lease", started.jobId);

    const acquisitions = await Promise.all([
      acquireLease(processingClientA, started.jobId, projectId, "worker-a"),
      acquireLease(processingClientB, started.jobId, projectId, "worker-b"),
    ]);
    const acquired = acquisitions.find((result) => result.outcome === "acquired")!;
    const busy = acquisitions.find((result) => result.outcome === "busy");

    expect(acquisitions.filter((result) => result.outcome === "acquired")).toHaveLength(1);
    expect(busy).toMatchObject({ expiresAt: null, leaseToken: null });

    const replay = await acquireLease(
      processingClientA,
      started.jobId,
      projectId,
      acquired === acquisitions[0] ? "worker-a" : "worker-b",
    );
    expect(replay).toEqual(acquired);
    await expect(
      migrationClient.pool.query(
        `SELECT attempt_count AS "attemptCount", progress, status::text, step::text
         FROM processing_jobs
         WHERE id = $1`,
        [started.jobId],
      ),
    ).resolves.toMatchObject({
      rows: [{ attemptCount: 1, progress: 10, status: "active", step: "preparing" }],
    });
  });

  it("requires the exact owner and token for renew, release, and progress", async () => {
    const projectId = await createUploadedProject("reliability-user-a", "Lease token fencing");
    const started = await startAnalysis(processingClientA, "reliability-user-a", projectId);
    await publishDispatch(processingClientA, "dispatcher-token", started.jobId);
    const acquired = await acquireLease(
      processingClientA,
      started.jobId,
      projectId,
      "worker-token",
    );

    await expect(
      processingClientB.pool.query(
        "SELECT public.renew_analysis_execution_lease($1, $2, $3) AS outcome",
        [started.jobId, "wrong-worker", acquired.leaseToken],
      ),
    ).resolves.toMatchObject({ rows: [{ outcome: "lost" }] });
    await expect(
      processingClientB.pool.query(
        "SELECT public.update_analysis_execution_progress($1, $2, $3, $4, $5) AS outcome",
        [started.jobId, "worker-token", randomUUID(), "transcribing", 45],
      ),
    ).resolves.toMatchObject({ rows: [{ outcome: "lost" }] });
    await expect(
      processingClientB.pool.query(
        "SELECT public.release_analysis_execution_lease($1, $2, $3) AS outcome",
        [started.jobId, "wrong-worker", acquired.leaseToken],
      ),
    ).resolves.toMatchObject({ rows: [{ outcome: "lost" }] });
    await expect(
      processingClientA.pool.query(
        "SELECT public.renew_analysis_execution_lease($1, $2, $3) AS outcome",
        [started.jobId, "worker-token", acquired.leaseToken],
      ),
    ).resolves.toMatchObject({ rows: [{ outcome: "renewed" }] });
    await expect(
      processingClientA.pool.query(
        "SELECT public.update_analysis_execution_progress($1, $2, $3, $4, $5) AS outcome",
        [started.jobId, "worker-token", acquired.leaseToken, "transcribing", 45],
      ),
    ).resolves.toMatchObject({ rows: [{ outcome: "updated" }] });
    await expect(
      processingClientA.pool.query(
        "SELECT public.release_analysis_execution_lease($1, $2, $3) AS outcome",
        [started.jobId, "worker-token", acquired.leaseToken],
      ),
    ).resolves.toMatchObject({ rows: [{ outcome: "released" }] });
    await expect(
      migrationClient.pool.query(
        `SELECT execution_lease_token AS "leaseToken", progress, status::text, step::text
         FROM processing_jobs WHERE id = $1`,
        [started.jobId],
      ),
    ).resolves.toMatchObject({
      rows: [{ leaseToken: null, progress: 0, status: "queued", step: "queued" }],
    });
  });

  it("permits takeover only after execution-lease expiry", async () => {
    const projectId = await createUploadedProject("reliability-user-a", "Expired takeover");
    const started = await startAnalysis(processingClientA, "reliability-user-a", projectId);
    await publishDispatch(processingClientA, "dispatcher-takeover", started.jobId);
    const first = await acquireLease(processingClientA, started.jobId, projectId, "worker-first");

    await migrationClient.pool.query(
      `UPDATE processing_jobs
       SET execution_lease_expires_at = now() - interval '1 second'
       WHERE id = $1`,
      [started.jobId],
    );
    const takeover = await acquireLease(
      processingClientB,
      started.jobId,
      projectId,
      "worker-takeover",
    );

    expect(takeover).toMatchObject({ outcome: "acquired" });
    expect(takeover.leaseToken).not.toBe(first.leaseToken);
    await expect(
      migrationClient.pool.query(
        `SELECT attempt_count AS "attemptCount", execution_lease_owner AS "owner"
         FROM processing_jobs WHERE id = $1`,
        [started.jobId],
      ),
    ).resolves.toMatchObject({ rows: [{ attemptCount: 2, owner: "worker-takeover" }] });
  });

  it("rejects wrong-project, unpublished, unpaid, and terminal acquisition", async () => {
    const projectId = await createUploadedProject("reliability-user-a", "Acquire validation");
    const started = await startAnalysis(processingClientA, "reliability-user-a", projectId);

    await expect(
      acquireLease(processingClientA, started.jobId, randomUUID(), "worker-wrong-project"),
    ).resolves.toMatchObject({ outcome: "rejected" });
    await expect(
      acquireLease(processingClientA, started.jobId, projectId, "worker-unpublished"),
    ).resolves.toMatchObject({ outcome: "rejected" });

    await publishDispatch(processingClientA, "dispatcher-terminal", started.jobId);
    await finalizeFailure(processingClientA, started.jobId, "USER_CANCELLED");
    await expect(
      acquireLease(processingClientA, started.jobId, projectId, "worker-terminal"),
    ).resolves.toMatchObject({ outcome: "rejected" });

    const unpaidProjectId = await createUploadedProject("reliability-user-a", "Missing deduction");
    const unpaidJob = await migrationClient.pool.query<{ id: string }>(
      `INSERT INTO processing_jobs (
         project_id, user_id, type, status, step, progress, credits_charged, bullmq_job_id
       )
       VALUES ($1, 'reliability-user-a', 'analyze_video', 'queued', 'queued', 0, 11, NULL)
       RETURNING id`,
      [unpaidProjectId],
    );
    const unpaidJobId = unpaidJob.rows[0]!.id;
    await migrationClient.pool.query(
      `UPDATE projects SET status = 'queued', current_job_id = $2 WHERE id = $1`,
      [unpaidProjectId, unpaidJobId],
    );
    await migrationClient.pool.query(
      `UPDATE processing_job_dispatches
       SET status = 'published',
           bullmq_job_id = $2,
           published_at = now()
       WHERE processing_job_id = $1`,
      [unpaidJobId, unpaidJobId],
    );
    await migrationClient.pool.query(
      "UPDATE processing_jobs SET bullmq_job_id = $2 WHERE id = $1",
      [unpaidJobId, unpaidJobId],
    );

    await expect(
      acquireLease(processingClientA, unpaidJobId, unpaidProjectId, "worker-unpaid"),
    ).resolves.toMatchObject({ outcome: "rejected" });
  });

  it("defers failure finalization while the worker lease is valid, then refunds once", async () => {
    const projectId = await createUploadedProject("reliability-user-a", "Lease defers failure");
    const started = await startAnalysis(processingClientA, "reliability-user-a", projectId);
    await publishDispatch(processingClientA, "dispatcher-deferral", started.jobId);
    await acquireLease(processingClientA, started.jobId, projectId, "worker-deferral");

    await expect(
      persistFailureIntent(
        processingClientB,
        started.jobId,
        "ANALYSIS_RETRIES_EXHAUSTED",
        "queue:failed-during-lease",
      ),
    ).resolves.toBe("persisted");
    await expect(
      claimFailureIntent(processingClientB, "sweeper-deferred", started.jobId),
    ).resolves.toBeUndefined();
    await expect(
      finalizeFailure(processingClientB, started.jobId, "ANALYSIS_RETRIES_EXHAUSTED"),
    ).resolves.toEqual({ outcome: "lease_active", refundedCredits: 0 });
    await expect(
      migrationClient.pool.query(
        `SELECT COUNT(*)::integer AS refunds
         FROM credit_ledger WHERE processing_job_id = $1 AND type = 'refund'`,
        [started.jobId],
      ),
    ).resolves.toMatchObject({ rows: [{ refunds: 0 }] });

    await migrationClient.pool.query(
      `UPDATE processing_jobs
       SET execution_lease_expires_at = now() - interval '1 second'
       WHERE id = $1`,
      [started.jobId],
    );
    const claim = await claimFailureIntent(
      processingClientB,
      "sweeper-after-expiry",
      started.jobId,
    );
    expect(claim).toBeDefined();
    const refunds = await Promise.all([
      finalizeFailure(processingClientA, started.jobId, "ANALYSIS_RETRIES_EXHAUSTED"),
      finalizeFailure(processingClientB, started.jobId, "ANALYSIS_RETRIES_EXHAUSTED"),
    ]);

    expect(refunds.map((result) => result.outcome).sort()).toEqual([
      "already_refunded",
      "refunded",
    ]);
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

  it("never upgrades an accepted ineligible failure into a refundable reason", async () => {
    const projectId = await createUploadedProject(
      "reliability-user-a",
      "Immutable ineligible failure",
    );
    const started = await startAnalysis(processingClientA, "reliability-user-a", projectId);

    await expect(
      finalizeFailure(processingClientA, started.jobId, "USER_CANCELLED"),
    ).resolves.toEqual({ outcome: "failed_no_refund", refundedCredits: 0 });
    await expect(
      finalizeFailure(processingClientB, started.jobId, "ANALYSIS_RETRIES_EXHAUSTED"),
    ).resolves.toEqual({ outcome: "terminal_failure_conflict", refundedCredits: 0 });
    await expect(
      migrationClient.pool.query(
        `SELECT
          job.error_code AS "errorCode",
          job.refund_eligible AS "refundEligible",
          COUNT(*) FILTER (WHERE ledger.type = 'refund')::integer AS refunds
         FROM processing_jobs AS job
         LEFT JOIN credit_ledger AS ledger ON ledger.processing_job_id = job.id
         WHERE job.id = $1
         GROUP BY job.error_code, job.refund_eligible`,
        [started.jobId],
      ),
    ).resolves.toMatchObject({
      rows: [{ errorCode: "USER_CANCELLED", refundEligible: false, refunds: 0 }],
    });
  });

  it("keeps the original eligible failure and exact refund across a conflicting replay", async () => {
    const projectId = await createUploadedProject(
      "reliability-user-a",
      "Immutable eligible failure",
    );
    const started = await startAnalysis(processingClientA, "reliability-user-a", projectId);

    await expect(
      finalizeFailure(processingClientA, started.jobId, "ANALYSIS_RETRIES_EXHAUSTED"),
    ).resolves.toEqual({ outcome: "refunded", refundedCredits: 11 });
    await expect(
      finalizeFailure(processingClientB, started.jobId, "USER_CANCELLED"),
    ).resolves.toEqual({ outcome: "terminal_failure_conflict", refundedCredits: 0 });
    await expect(
      migrationClient.pool.query(
        `SELECT
          job.error_code AS "errorCode",
          job.refund_eligible AS "refundEligible",
          COUNT(*) FILTER (WHERE ledger.type = 'refund')::integer AS refunds
         FROM processing_jobs AS job
         LEFT JOIN credit_ledger AS ledger ON ledger.processing_job_id = job.id
         WHERE job.id = $1
         GROUP BY job.error_code, job.refund_eligible`,
        [started.jobId],
      ),
    ).resolves.toMatchObject({
      rows: [
        {
          errorCode: "ANALYSIS_RETRIES_EXHAUSTED",
          refundEligible: true,
          refunds: 1,
        },
      ],
    });
  });

  it("accepts one concurrent conflicting terminal reason without a later policy flip", async () => {
    const projectId = await createUploadedProject(
      "reliability-user-a",
      "Concurrent conflicting failure",
    );
    const started = await startAnalysis(processingClientA, "reliability-user-a", projectId);

    const results = await Promise.all([
      finalizeFailure(processingClientA, started.jobId, "USER_CANCELLED"),
      finalizeFailure(processingClientB, started.jobId, "ANALYSIS_RETRIES_EXHAUSTED"),
    ]);
    const state = await migrationClient.pool.query<{
      errorCode: string;
      refundEligible: boolean;
      refunds: number;
    }>(
      `SELECT
        job.error_code AS "errorCode",
        job.refund_eligible AS "refundEligible",
        COUNT(*) FILTER (WHERE ledger.type = 'refund')::integer AS refunds
       FROM processing_jobs AS job
       LEFT JOIN credit_ledger AS ledger ON ledger.processing_job_id = job.id
       WHERE job.id = $1
       GROUP BY job.error_code, job.refund_eligible`,
      [started.jobId],
    );

    expect(results.map((result) => result.outcome)).toContain("terminal_failure_conflict");
    const accepted = state.rows[0]!;
    expect(accepted.refundEligible).toBe(accepted.errorCode === "ANALYSIS_RETRIES_EXHAUSTED");
    expect(accepted.refunds).toBe(accepted.refundEligible ? 1 : 0);
  });

  it("retries the same ineligible failure without creating a refund", async () => {
    const projectId = await createUploadedProject(
      "reliability-user-a",
      "Repeated ineligible failure",
    );
    const started = await startAnalysis(processingClientA, "reliability-user-a", projectId);

    const results = await Promise.all([
      finalizeFailure(processingClientA, started.jobId, "USER_CANCELLED"),
      finalizeFailure(processingClientB, started.jobId, "USER_CANCELLED"),
    ]);

    expect(results).toEqual([
      { outcome: "failed_no_refund", refundedCredits: 0 },
      { outcome: "failed_no_refund", refundedCredits: 0 },
    ]);
    await expect(
      migrationClient.pool.query(
        `SELECT COUNT(*)::integer AS refunds
         FROM credit_ledger
         WHERE processing_job_id = $1 AND type = 'refund'`,
        [started.jobId],
      ),
    ).resolves.toMatchObject({ rows: [{ refunds: 0 }] });
  });

  it("leases one durable failure intent to one sweeper and survives a lost marker", async () => {
    const projectId = await createUploadedProject("reliability-user-a", "Durable failure intent");
    const started = await startAnalysis(processingClientA, "reliability-user-a", projectId);

    await expect(
      persistFailureIntent(
        processingClientA,
        started.jobId,
        "ANALYSIS_RETRIES_EXHAUSTED",
        "queue:event-1",
      ),
    ).resolves.toBe("persisted");
    const claims = await Promise.all([
      claimFailureIntent(processingClientA, "sweeper-a", started.jobId),
      claimFailureIntent(processingClientB, "sweeper-b", started.jobId),
    ]);
    const firstClaim = claims.find((claim) => claim !== undefined)!;
    expect(claims.filter((claim) => claim !== undefined)).toHaveLength(1);

    await expect(
      finalizeFailure(processingClientA, started.jobId, firstClaim.failureCode),
    ).resolves.toEqual({ outcome: "refunded", refundedCredits: 11 });

    await migrationClient.pool.query(
      `UPDATE processing_failure_intents
       SET lease_expires_at = now() - interval '1 second'
       WHERE id = $1`,
      [firstClaim.intentId],
    );
    const retryClaim = await claimFailureIntent(
      processingClientB,
      "sweeper-restarted",
      started.jobId,
    );
    expect(retryClaim).toBeDefined();
    await expect(
      finalizeFailure(processingClientB, started.jobId, retryClaim!.failureCode),
    ).resolves.toEqual({ outcome: "already_refunded", refundedCredits: 11 });
    await processingClientB.pool.query(
      "SELECT public.mark_processing_failure_intent_finalized($1, $2)",
      [retryClaim!.intentId, retryClaim!.leaseToken],
    );

    await expect(
      migrationClient.pool.query(
        `SELECT
          intent.status::text AS status,
          COUNT(*) FILTER (WHERE ledger.type = 'refund')::integer AS refunds
         FROM processing_failure_intents AS intent
         LEFT JOIN credit_ledger AS ledger
           ON ledger.processing_job_id = intent.processing_job_id
         WHERE intent.processing_job_id = $1
         GROUP BY intent.status`,
        [started.jobId],
      ),
    ).resolves.toMatchObject({ rows: [{ refunds: 1, status: "finalized" }] });
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

  it("grants lifecycle execution only to processing and denies direct lease mutation", async () => {
    const lifecycleCall = "SELECT * FROM public.acquire_analysis_execution_lease($1, $2, $3)";
    const parameters = [randomUUID(), randomUUID(), "foreign-worker"];

    for (const client of [runtimeClient, checkoutClient, webhookClient]) {
      await expect(client.pool.query(lifecycleCall, parameters)).rejects.toThrow(
        /permission denied/i,
      );
    }
    for (const client of [runtimeClient, checkoutClient, webhookClient, processingClientA]) {
      await expect(
        client.pool.query(
          `UPDATE processing_jobs
           SET execution_lease_token = gen_random_uuid()
           WHERE id = $1`,
          [randomUUID()],
        ),
      ).rejects.toThrow(/permission denied/i);
    }
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

  async function acquireLease(
    client: DatabaseClient,
    targetJobId: string,
    targetProjectId: string,
    targetWorkerId: string,
  ): Promise<{
    expiresAt: Date | null;
    leaseToken: string | null;
    outcome: string;
  }> {
    const result = await client.pool.query<{
      expiresAt: Date | null;
      leaseToken: string | null;
      outcome: string;
    }>(
      `SELECT
         outcome,
         lease_token AS "leaseToken",
         expires_at AS "expiresAt"
       FROM public.acquire_analysis_execution_lease($1, $2, $3)`,
      [targetJobId, targetProjectId, targetWorkerId],
    );
    return result.rows[0]!;
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

  async function persistFailureIntent(
    client: DatabaseClient,
    jobId: string,
    failureCode: string,
    sourceReference: string,
  ): Promise<string> {
    const result = await client.pool.query<{ outcome: string }>(
      "SELECT public.persist_processing_failure_intent($1, $2, $3, $4) AS outcome",
      [
        jobId,
        failureCode,
        "Processing failed before a usable result was produced.",
        sourceReference,
      ],
    );
    return result.rows[0]!.outcome;
  }

  async function claimFailureIntent(
    client: DatabaseClient,
    sweeperId: string,
    jobId: string,
  ): Promise<
    | {
        failureCode: string;
        intentId: string;
        leaseToken: string;
      }
    | undefined
  > {
    const result = await client.pool.query<{
      failureCode: string;
      intentId: string;
      leaseToken: string;
    }>(
      `SELECT
        failure_code AS "failureCode",
        intent_id AS "intentId",
        lease_token AS "leaseToken"
       FROM public.claim_processing_failure_intent($1, $2)`,
      [sweeperId, jobId],
    );
    return result.rows[0];
  }
});
