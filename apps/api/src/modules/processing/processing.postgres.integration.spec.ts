import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { resolve } from "node:path";

import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { closeDatabaseClient, createDatabaseClient, type DatabaseClient } from "@repurposepro/db";
import type { VideoAnalysisJobPayload } from "@repurposepro/shared";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { AuthService } from "../auth/auth.service";
import { DatabaseService } from "../infrastructure/database.service";
import { RedisService } from "../infrastructure/redis.service";
import { ANALYSIS_DISPATCHER_OPTIONS } from "./analysis-dispatcher.service";
import { ANALYSIS_QUEUE_EVENTS } from "./analysis-queue-failure.listener";
import { ANALYSIS_RATE_LIMIT_CLIENT } from "./analysis-rate-limit.guard";
import { ANALYSIS_QUEUE_GATEWAY } from "./analysis-queue.gateway";
import { ProcessingModule } from "./processing.module";
import { PROCESSING_DATABASE } from "./scoped-database.provider";

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

describeIntegration("paid processing start API", () => {
  const database = `repurposepro_processing_api_${randomUUID().replaceAll("-", "")}`;
  const adminClient = createClient(bootstrapUrl ?? skippedDatabaseUrl);
  const migrationClient = createClient(withDatabase(migrationUrl, database));
  const runtimeClient = createClient(withDatabase(runtimeUrl, database));
  const processingClient = createClient(
    withDatabase(withRole(runtimeUrl, "repurposepro_processing"), database),
  );
  const enqueue = vi.fn(async (payload: VideoAnalysisJobPayload) => payload.jobId);
  let failNextQueueMarker = false;
  let terminalFailureHandler:
    ((args: { readonly jobId: string }, eventId: string) => void) | undefined;
  let app: INestApplication;

  beforeAll(async () => {
    const runtimePassword = new URL(runtimeUrl ?? skippedDatabaseUrl).password;
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
        [role, decodeURIComponent(runtimePassword)],
      );
      await adminClient.pool.query(statement.rows[0]!.sql);
    }
    await adminClient.pool.query(`CREATE DATABASE ${database} OWNER repurposepro_owner`);
    await migrate(migrationClient.db, {
      migrationsFolder: resolve(process.cwd(), "packages/db/drizzle"),
    });
    await migrationClient.pool.query(
      `INSERT INTO users (id, name, email)
       VALUES ($1, $2, $3), ($4, $5, $6)`,
      [
        "processing-api-user-a",
        "Processing API User A",
        "processing-api-a@example.test",
        "processing-api-user-b",
        "Processing API User B",
        "processing-api-b@example.test",
      ],
    );
    await migrationClient.pool.query(
      `INSERT INTO projects (id, user_id, name, output_type, status)
       VALUES
         ($1, $2, $3, $4, $5),
         ($6, $2, $7, $4, $5),
         ($8, $2, $9, $4, $5)`,
      [
        "00000000-0000-4000-8000-000000000601",
        "processing-api-user-a",
        "Processing API project",
        "clips",
        "uploaded",
        "00000000-0000-4000-8000-000000000603",
        "Processing API marker recovery project",
        "00000000-0000-4000-8000-000000000605",
        "Processing API automatic refund project",
      ],
    );
    await migrationClient.pool.query(
      `INSERT INTO uploaded_videos (
        id, project_id, original_file_name, storage_path, mime_type, file_size_bytes,
        duration_seconds, width, height, has_audio, expires_at
      ) VALUES
        ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now() + interval '7 days'),
        ($11, $12, $13, $14, $5, $6, $15, $8, $9, $10, now() + interval '7 days'),
        ($16, $17, $18, $19, $5, $6, $20, $8, $9, $10, now() + interval '7 days')`,
      [
        "00000000-0000-4000-8000-000000000602",
        "00000000-0000-4000-8000-000000000601",
        "processing.mp4",
        "/private/processing.mp4",
        "video/mp4",
        1024,
        "600.001",
        1920,
        1080,
        true,
        "00000000-0000-4000-8000-000000000604",
        "00000000-0000-4000-8000-000000000603",
        "marker-recovery.mp4",
        "/private/marker-recovery.mp4",
        "300.001",
        "00000000-0000-4000-8000-000000000606",
        "00000000-0000-4000-8000-000000000605",
        "automatic-refund.mp4",
        "/private/automatic-refund.mp4",
        "120.001",
      ],
    );
    await migrationClient.pool.query(
      `INSERT INTO credit_ledger (user_id, type, amount, description, idempotency_key)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        "processing-api-user-a",
        "manual_adjustment",
        40,
        "Processing API credit",
        "processing-api-credit",
      ],
    );

    const getSession = async ({ headers }: { headers: Headers }) => {
      const userId = {
        "session=processing-a": "processing-api-user-a",
        "session=processing-b": "processing-api-user-b",
      }[headers.get("cookie") ?? ""];

      return userId
        ? {
            user: {
              email: `${userId}@example.test`,
              id: userId,
              name: userId,
            },
          }
        : null;
    };
    const moduleRef = await Test.createTestingModule({ imports: [ProcessingModule] })
      .overrideProvider(AuthService)
      .useValue({ auth: { api: { getSession } } })
      .overrideProvider(DatabaseService)
      .useValue({ database: runtimeClient })
      .overrideProvider(PROCESSING_DATABASE)
      .useValue({
        database: {
          pool: {
            query: async (text: string, values: unknown[]) => {
              if (failNextQueueMarker && text.includes("mark_analysis_dispatch_published")) {
                failNextQueueMarker = false;
                throw new Error("simulated marker persistence failure");
              }

              return processingClient.pool.query(text, values);
            },
          },
        },
      })
      .overrideProvider(RedisService)
      .useValue({})
      .overrideProvider(ANALYSIS_RATE_LIMIT_CLIENT)
      .useValue({ protect: vi.fn().mockResolvedValue({ isDenied: () => false }) })
      .overrideProvider(ANALYSIS_QUEUE_GATEWAY)
      .useValue({ enqueue, inspect: vi.fn().mockResolvedValue(null) })
      .overrideProvider(ANALYSIS_QUEUE_EVENTS)
      .useValue({
        close: vi.fn().mockResolvedValue(undefined),
        on: vi.fn(
          (
            event: "error" | "retries-exhausted",
            listener:
              | ((error: Error) => void)
              | ((args: { readonly jobId: string }, eventId: string) => void),
          ) => {
            if (event === "retries-exhausted") {
              terminalFailureHandler = listener as (
                args: { readonly jobId: string },
                eventId: string,
              ) => void;
            }
            return undefined;
          },
        ),
        waitUntilReady: vi.fn().mockResolvedValue(undefined),
      })
      .overrideProvider(ANALYSIS_DISPATCHER_OPTIONS)
      .useValue({
        dispatcherId: "processing-integration-dispatcher",
        intervalMs: 25,
        maxBatchSize: 10,
      })
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api/v1");
    await app.init();
    await app.listen(0, "127.0.0.1");
  }, 30_000);

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    await closeDatabaseClient(runtimeClient);
    await closeDatabaseClient(processingClient);
    await closeDatabaseClient(migrationClient);
    await adminClient.pool.query(`DROP DATABASE IF EXISTS ${database} WITH (FORCE)`);
    await closeDatabaseClient(adminClient);
  });

  it("automatically dispatches the same durable job after publication fails without another request", async () => {
    enqueue.mockRejectedValueOnce(new Error("private redis failure"));
    const first = await request("/api/v1/projects/00000000-0000-4000-8000-000000000601/analyze", {
      body: JSON.stringify({ confirmed: true }),
      headers: { "content-type": "application/json", cookie: "session=processing-a" },
      method: "POST",
    });
    const firstBody = (await first.json()) as unknown;
    const durableJob = await migrationClient.pool.query<{
      bullmqJobId: string | null;
      creditsCharged: number;
      dispatchStatus: string;
      id: string;
    }>(
      `SELECT
        job.id,
        job.bullmq_job_id AS "bullmqJobId",
        job.credits_charged AS "creditsCharged",
        dispatch.status::text AS "dispatchStatus"
       FROM processing_jobs AS job
       JOIN processing_job_dispatches AS dispatch
         ON dispatch.processing_job_id = job.id
       WHERE job.project_id = $1
         AND job.type = 'analyze_video'`,
      ["00000000-0000-4000-8000-000000000601"],
    );
    const [storedJob] = durableJob.rows;

    expect(first.status).toBe(503);
    expect(firstBody).toMatchObject({
      error: {
        code: "QUEUE_UNAVAILABLE",
        details: null,
        message:
          "Your processing job is saved and will retry automatically when the queue recovers.",
      },
    });
    expect(storedJob).toMatchObject({
      bullmqJobId: null,
      creditsCharged: 11,
      dispatchStatus: "pending",
    });

    if (!storedJob) {
      throw new Error("The failed enqueue must leave one durable processing job.");
    }

    await waitForDispatchPublished(storedJob.id);
    expect(enqueue).toHaveBeenNthCalledWith(1, {
      jobId: storedJob.id,
      projectId: "00000000-0000-4000-8000-000000000601",
    });
    expect(enqueue).toHaveBeenNthCalledWith(2, {
      jobId: storedJob.id,
      projectId: "00000000-0000-4000-8000-000000000601",
    });

    const status = await request("/api/v1/projects/00000000-0000-4000-8000-000000000601/status", {
      headers: { cookie: "session=processing-a" },
    });
    const refreshedStatus = await request(
      "/api/v1/projects/00000000-0000-4000-8000-000000000601/status",
      { headers: { cookie: "session=processing-a" } },
    );

    expect(status.status).toBe(200);
    expect(status.headers.get("cache-control")).toBe("private, no-store");
    await expect(status.json()).resolves.toEqual({
      data: {
        currentJob: {
          id: storedJob.id,
          progress: null,
          status: "queued",
          step: "queued",
        },
        projectId: "00000000-0000-4000-8000-000000000601",
        status: "queued",
      },
    });
    expect(refreshedStatus.status).toBe(200);

    await expect(
      migrationClient.pool.query<{
        balance: string;
        bullmqJobId: string | null;
        deductionCount: string;
      }>(
        `SELECT
          (SELECT COALESCE(SUM(amount), 0)::text FROM credit_ledger WHERE user_id = $1) AS balance,
          (SELECT COUNT(*)::text FROM credit_ledger WHERE processing_job_id = $2) AS "deductionCount",
          (SELECT bullmq_job_id FROM processing_jobs WHERE id = $2) AS "bullmqJobId"`,
        ["processing-api-user-a", storedJob.id],
      ),
    ).resolves.toMatchObject({
      rows: [{ balance: "29", bullmqJobId: storedJob.id, deductionCount: "1" }],
    });
  });

  it("conceals foreign projects and rejects unconfirmed bodies before charging", async () => {
    const foreign = await request("/api/v1/projects/00000000-0000-4000-8000-000000000601/analyze", {
      body: JSON.stringify({ confirmed: true }),
      headers: { "content-type": "application/json", cookie: "session=processing-b" },
      method: "POST",
    });
    const unconfirmed = await request(
      "/api/v1/projects/00000000-0000-4000-8000-000000000601/analyze",
      {
        body: JSON.stringify({ confirmed: false }),
        headers: { "content-type": "application/json", cookie: "session=processing-a" },
        method: "POST",
      },
    );
    const foreignStatus = await request(
      "/api/v1/projects/00000000-0000-4000-8000-000000000601/status",
      { headers: { cookie: "session=processing-b" } },
    );

    expect(foreign.status).toBe(404);
    await expect(foreign.json()).resolves.toMatchObject({
      error: { code: "PROJECT_NOT_FOUND", details: null, message: "Project not found." },
    });
    expect(foreignStatus.status).toBe(404);
    await expect(foreignStatus.json()).resolves.toMatchObject({
      error: { code: "PROJECT_NOT_FOUND", details: null, message: "Project not found." },
    });
    expect(unconfirmed.status).toBe(422);
    await expect(unconfirmed.json()).resolves.toMatchObject({
      error: {
        code: "PROCESSING_CONFIRMATION_REQUIRED",
        details: null,
        message: "Confirm the credit charge before starting processing.",
      },
    });
  });

  it("recovers after queue publication succeeds but marker persistence fails", async () => {
    failNextQueueMarker = true;
    const path = "/api/v1/projects/00000000-0000-4000-8000-000000000603/analyze";
    const init: RequestInit = {
      body: JSON.stringify({ confirmed: true }),
      headers: { "content-type": "application/json", cookie: "session=processing-a" },
      method: "POST",
    };

    const first = await request(path, init);
    expect(first.status).toBe(503);

    const durable = await migrationClient.pool.query<{
      bullmqJobId: string | null;
      id: string;
    }>(
      `SELECT id, bullmq_job_id AS "bullmqJobId"
       FROM processing_jobs
       WHERE project_id = $1
         AND type = 'analyze_video'`,
      ["00000000-0000-4000-8000-000000000603"],
    );
    expect(durable.rows).toHaveLength(1);
    expect(durable.rows[0]?.bullmqJobId).toBeNull();
    expect(typeof durable.rows[0]?.id).toBe("string");

    await waitForDispatchPublished(durable.rows[0]!.id);
    expect(enqueue).toHaveBeenLastCalledWith({
      jobId: durable.rows[0]!.id,
      projectId: "00000000-0000-4000-8000-000000000603",
    });

    await expect(
      migrationClient.pool.query<{ deductionCount: string; bullmqJobId: string | null }>(
        `SELECT
          (SELECT COUNT(*)::text FROM credit_ledger WHERE processing_job_id = $1)
            AS "deductionCount",
          bullmq_job_id AS "bullmqJobId"
         FROM processing_jobs
         WHERE id = $1`,
        [durable.rows[0]!.id],
      ),
    ).resolves.toMatchObject({
      rows: [{ bullmqJobId: durable.rows[0]!.id, deductionCount: "1" }],
    });
  });

  it("automatically refunds an eligible terminal queue failure exactly once", async () => {
    const response = await request(
      "/api/v1/projects/00000000-0000-4000-8000-000000000605/analyze",
      {
        body: JSON.stringify({ confirmed: true }),
        headers: { "content-type": "application/json", cookie: "session=processing-a" },
        method: "POST",
      },
    );
    const body = (await response.json()) as { data?: { jobId: string } };

    expect([202, 503]).toContain(response.status);
    if (!terminalFailureHandler) {
      throw new Error("Terminal queue failure listener was not registered.");
    }

    const stored = await migrationClient.pool.query<{ jobId: string }>(
      `SELECT id AS "jobId"
       FROM processing_jobs
       WHERE project_id = $1 AND type = 'analyze_video'`,
      ["00000000-0000-4000-8000-000000000605"],
    );
    const terminalJobId = body.data?.jobId ?? stored.rows[0]?.jobId;
    if (!terminalJobId) {
      throw new Error("Terminal failure test did not create one durable job.");
    }

    await waitForDispatchPublished(terminalJobId);
    terminalFailureHandler({ jobId: terminalJobId }, "terminal-event-1");
    terminalFailureHandler({ jobId: terminalJobId }, "terminal-event-retry");
    await waitForJobStatus(terminalJobId, "refunded");

    await expect(
      migrationClient.pool.query<{
        amount: number;
        count: string;
        jobStatus: string;
        projectStatus: string;
      }>(
        `SELECT
          job.status::text AS "jobStatus",
          project.status::text AS "projectStatus",
          COUNT(*) FILTER (WHERE ledger.type = 'refund')::text AS count,
          COALESCE(SUM(ledger.amount) FILTER (WHERE ledger.type = 'refund'), 0)::integer AS amount
         FROM processing_jobs AS job
         JOIN projects AS project ON project.id = job.project_id
         LEFT JOIN credit_ledger AS ledger ON ledger.processing_job_id = job.id
         WHERE job.id = $1
         GROUP BY job.status, project.status`,
        [terminalJobId],
      ),
    ).resolves.toMatchObject({
      rows: [
        {
          amount: 3,
          count: "1",
          jobStatus: "refunded",
          projectStatus: "refunded",
        },
      ],
    });
  });

  function request(path: string, init?: RequestInit): Promise<Response> {
    const server = app.getHttpServer() as Server;
    const address = server.address() as AddressInfo;
    return fetch(`http://127.0.0.1:${address.port}${path}`, init);
  }

  async function waitForDispatchPublished(jobId: string): Promise<void> {
    const deadline = Date.now() + 3_000;

    while (Date.now() < deadline) {
      const result = await migrationClient.pool.query<{ status: string }>(
        `SELECT status::text
         FROM processing_job_dispatches
         WHERE processing_job_id = $1`,
        [jobId],
      );
      if (result.rows[0]?.status === "published") {
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, 25));
    }

    throw new Error("Background dispatcher did not publish the pending analysis job.");
  }

  async function waitForJobStatus(jobId: string, expectedStatus: string): Promise<void> {
    const deadline = Date.now() + 3_000;

    while (Date.now() < deadline) {
      const result = await migrationClient.pool.query<{ status: string }>(
        `SELECT status::text FROM processing_jobs WHERE id = $1`,
        [jobId],
      );
      if (result.rows[0]?.status === expectedStatus) {
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, 25));
    }

    throw new Error(`Processing job ${jobId} did not reach ${expectedStatus}.`);
  }
});
