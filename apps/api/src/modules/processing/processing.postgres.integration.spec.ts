import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { resolve } from "node:path";

import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { closeDatabaseClient, createDatabaseClient, type DatabaseClient } from "@repurposepro/db";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { AuthService } from "../auth/auth.service";
import { DatabaseService } from "../infrastructure/database.service";
import { RedisService } from "../infrastructure/redis.service";
import { ANALYSIS_RATE_LIMIT_CLIENT } from "./analysis-rate-limit.guard";
import { ProcessingModule } from "./processing.module";

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

function createClient(connectionString: string): DatabaseClient {
  return createDatabaseClient({ connectionString, poolMax: 2, ssl: false });
}

describeIntegration("paid processing start API", () => {
  const database = `repurposepro_processing_api_${randomUUID().replaceAll("-", "")}`;
  const adminClient = createClient(bootstrapUrl ?? skippedDatabaseUrl);
  const migrationClient = createClient(withDatabase(migrationUrl, database));
  const runtimeClient = createClient(withDatabase(runtimeUrl, database));
  let app: INestApplication;

  beforeAll(async () => {
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
       VALUES ($1, $2, $3, $4, $5)`,
      [
        "00000000-0000-4000-8000-000000000601",
        "processing-api-user-a",
        "Processing API project",
        "clips",
        "uploaded",
      ],
    );
    await migrationClient.pool.query(
      `INSERT INTO uploaded_videos (
        id, project_id, original_file_name, storage_path, mime_type, file_size_bytes,
        duration_seconds, width, height, has_audio, expires_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now() + interval '7 days')`,
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
      .overrideProvider(RedisService)
      .useValue({})
      .overrideProvider(ANALYSIS_RATE_LIMIT_CLIENT)
      .useValue({ protect: vi.fn().mockResolvedValue({ isDenied: () => false }) })
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
    await closeDatabaseClient(migrationClient);
    await adminClient.pool.query(`DROP DATABASE IF EXISTS ${database} WITH (FORCE)`);
    await closeDatabaseClient(adminClient);
  });

  it("starts once for the session owner and returns the stored queued job on retry", async () => {
    const first = await request("/api/v1/projects/00000000-0000-4000-8000-000000000601/analyze", {
      body: JSON.stringify({ confirmed: true }),
      headers: { "content-type": "application/json", cookie: "session=processing-a" },
      method: "POST",
    });
    const firstBody = (await first.json()) as {
      data: { creditsCharged: number; jobId: string; projectId: string; status: string };
    };
    const retry = await request("/api/v1/projects/00000000-0000-4000-8000-000000000601/analyze", {
      body: JSON.stringify({ confirmed: true }),
      headers: { "content-type": "application/json", cookie: "session=processing-a" },
      method: "POST",
    });

    expect(first.status).toBe(202);
    if (typeof firstBody.data.jobId !== "string") {
      throw new Error("The paid analysis start response must include a job ID.");
    }
    expect(firstBody).toEqual({
      data: {
        creditsCharged: 11,
        jobId: firstBody.data.jobId,
        projectId: "00000000-0000-4000-8000-000000000601",
        status: "queued",
      },
    });
    await expect(retry.json()).resolves.toEqual(firstBody);

    await expect(
      migrationClient.pool.query<{ balance: string; deductionCount: string }>(
        `SELECT
          (SELECT COALESCE(SUM(amount), 0)::text FROM credit_ledger WHERE user_id = $1) AS balance,
          (SELECT COUNT(*)::text FROM credit_ledger WHERE processing_job_id = $2) AS "deductionCount"`,
        ["processing-api-user-a", firstBody.data.jobId],
      ),
    ).resolves.toMatchObject({ rows: [{ balance: "29", deductionCount: "1" }] });
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

    expect(foreign.status).toBe(404);
    await expect(foreign.json()).resolves.toMatchObject({
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

  function request(path: string, init?: RequestInit): Promise<Response> {
    const server = app.getHttpServer() as Server;
    const address = server.address() as AddressInfo;
    return fetch(`http://127.0.0.1:${address.port}${path}`, init);
  }
});
