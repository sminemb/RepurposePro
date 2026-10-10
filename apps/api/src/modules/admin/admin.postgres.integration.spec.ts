import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { createDatabaseClient, closeDatabaseClient } from "@repurposepro/db";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AdminService } from "./admin.service";
import type { AdminDatabaseService } from "./admin-database.service";
import { decodeAdminCursor } from "./admin.contracts";

const bootstrapUrl = process.env.TEST_DATABASE_BOOTSTRAP_URL;
const ownerUrl = process.env.TEST_DATABASE_MIGRATION_URL;
const runtimeUrl = process.env.TEST_DATABASE_RUNTIME_URL;
const integration = bootstrapUrl && ownerUrl && runtimeUrl ? describe : describe.skip;

integration("admin metadata boundary", () => {
  const name = `repurposepro_admin_${randomUUID().replaceAll("-", "")}`;
  const url = (base: string, role?: string) => {
    const value = new URL(base);
    value.pathname = `/${name}`;
    if (role) value.username = role;
    return value.toString();
  };
  const client = (connectionString: string | undefined) =>
    createDatabaseClient({
      connectionString: connectionString ?? "postgresql://localhost/postgres",
      poolMax: 2,
      ssl: false,
    });
  const bootstrapClient = client(bootstrapUrl);
  const ownerClient = client(ownerUrl ? url(ownerUrl) : undefined);
  const adminClient = client(runtimeUrl ? url(runtimeUrl, "repurposepro_admin") : undefined);
  const bootstrap = bootstrapClient.pool;
  const owner = ownerClient.pool;
  const admin = adminClient.pool;
  const service = new AdminService({ pool: admin } as unknown as AdminDatabaseService);
  const projectId = randomUUID();
  const jobId = randomUUID();
  const now = new Date("2026-10-10T12:00:00Z");
  beforeAll(async () => {
    await bootstrap.query(`CREATE DATABASE ${name} OWNER repurposepro_owner`);
    await migrate(drizzle(owner), { migrationsFolder: resolve("packages/db/drizzle") });
    await owner.query(
      "INSERT INTO users(id,name,email,created_at) VALUES('admin-fixture','Operator','Operator@example.com','2026-10-10T11:00:00.123456Z'),('other-fixture','Other','other@example.com','2026-10-10T11:00:00.123456Z'),('old-fixture','Old','old@example.com','2026-08-01T00:00:00Z')",
    );
    await owner.query(
      "INSERT INTO projects(id,user_id,name,output_type,status,created_at) VALUES($1,'admin-fixture','SECRET PROJECT TITLE','clips','failed','2026-10-10T10:00:00Z')",
      [projectId],
    );
    await owner.query(
      "INSERT INTO processing_jobs(id,project_id,user_id,type,status,step,error_code,error_message,created_at) VALUES($1,$2,'admin-fixture','render_clips','failed','failed','raw secret code','raw secret message','2026-10-10T10:00:00Z')",
      [jobId, projectId],
    );
    await owner.query(
      "INSERT INTO processing_jobs(project_id,user_id,type,status,created_at) VALUES($1,'admin-fixture','render_clips','queued','2026-06-01T10:00:00Z')",
      [projectId],
    );
    await owner.query(
      "INSERT INTO stripe_payments(user_id,stripe_event_id,pack_code,amount_cents,currency,credits_granted,status,created_at) VALUES('admin-fixture','SECRET_EVENT','starter',1000,'usd',40,'paid','2026-10-10T10:00:00Z'),('other-fixture','SECRET_EVENT_2','starter',1000,'jpy',40,'failed','2026-09-20T10:00:00Z')",
    );
    await owner.query(
      "INSERT INTO credit_ledger(user_id,type,amount,description,idempotency_key,created_at) VALUES('admin-fixture','manual_adjustment',1,'SECRET DESCRIPTION','admin-fixture-ledger','2026-10-10T10:00:00Z')",
    );
  });
  afterAll(async () => {
    await closeDatabaseClient(adminClient);
    await closeDatabaseClient(ownerClient);
    await bootstrap.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    await closeDatabaseClient(bootstrapClient);
  });
  it("reads only explicit safe metadata", async () => {
    expect((await admin.query("SELECT id,name,email,created_at FROM users")).rows).toHaveLength(3);
    for (const query of [
      "SELECT * FROM users",
      "SELECT image FROM users",
      "SELECT * FROM accounts",
      "SELECT error_message FROM processing_jobs",
      "SELECT error_code FROM processing_jobs",
      "SELECT stripe_event_id FROM stripe_payments",
      "SELECT description FROM credit_ledger",
      "SELECT * FROM uploaded_videos",
    ]) {
      await expect(admin.query(query)).rejects.toMatchObject({ code: "42501" });
    }
    const jobs = await admin.query("SELECT id,error_code FROM admin_job_metadata WHERE id=$1", [
      jobId,
    ]);
    expect(jobs.rows[0]).toMatchObject({ error_code: "UNKNOWN_FAILURE" });
  });
  it("cannot write, escalate or call application functions", async () => {
    for (const query of [
      "UPDATE users SET name='Changed' WHERE id='admin-fixture'",
      "UPDATE projects SET status='draft' WHERE false",
      "UPDATE processing_jobs SET status='queued' WHERE false",
      "UPDATE stripe_payments SET status='failed' WHERE false",
      "UPDATE credit_ledger SET amount=0 WHERE false",
      "DELETE FROM users",
      "INSERT INTO users(id,name,email) VALUES('x','x','x@y.com')",
      "CREATE TABLE public.admin_write_test(id int)",
      "SET ROLE repurposepro_owner",
      "SELECT public.get_owned_source_video_content('admin-fixture',gen_random_uuid())",
    ]) {
      await expect(admin.query(query)).rejects.toMatchObject({ code: "42501" });
    }
    const functions = await admin.query(
      "SELECT p.oid::regprocedure::text AS name FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND has_function_privilege(current_user,p.oid,'EXECUTE')",
    );
    expect(functions.rows).toEqual([]);
  });
  it("uses stable microsecond cursors and owner/status filters", async () => {
    const first = await service.list("users", { limit: 1 });
    expect(first.data[0]?.id).toBe("other-fixture");
    const second = await service.list("users", {
      limit: 1,
      cursor: decodeAdminCursor(first.meta.nextCursor!),
    });
    expect(second.data[0]?.id).toBe("admin-fixture");
    const jobs = await service.list("jobs", {
      limit: 20,
      userId: "admin-fixture",
      projectId,
      status: "failed",
    });
    expect(jobs.data).toHaveLength(1);
    expect(jobs.data[0]?.errorCode).toBe("UNKNOWN_FAILURE");
    expect(JSON.stringify(jobs)).not.toContain("secret");
    expect((await service.list("jobs", { limit: 20, userId: "other-fixture" })).data).toEqual([]);
  });
  it("looks up exact emails/IDs and returns only safe related details", async () => {
    expect((await service.search("OPERATOR@example.com")).users[0]?.id).toBe("admin-fixture");
    expect((await service.search(projectId)).projects[0]?.id).toBe(projectId);
    expect((await service.search(jobId)).jobs[0]?.id).toBe(jobId);
    expect(await service.search("missing-id")).toEqual({ users: [], projects: [], jobs: [] });
    const detail = await service.userDetail("admin-fixture");
    expect(detail?.projects.data).toHaveLength(1);
    expect(detail?.payments.data).toHaveLength(1);
    expect(detail?.ledger.data).toHaveLength(1);
    expect(JSON.stringify(detail)).not.toMatch(
      /SECRET|description|stripeEvent|errorMessage|raw secret/,
    );
    expect(await service.userDetail("missing-id")).toBeNull();
  });
  it("separates creation cohorts, currencies, and current queue counts", async () => {
    const week = await service.overview("7d", now);
    expect(week.usersCreated).toBe(2);
    expect(week.projectsCreated).toBe(1);
    expect(week.jobOutcomes).toEqual([{ status: "failed", count: 1 }]);
    expect(week.currentQueue).toEqual({ active: 0, queued: 1 });
    expect(week.payments).toEqual([
      { currency: "usd", status: "paid", count: 1, amountCents: 1000 },
    ]);
    expect((await service.overview("30d", now)).payments).toHaveLength(2);
    expect((await service.overview("90d", now)).usersCreated).toBe(3);
  });
  it("includes the lower time boundary and excludes the upper boundary", async () => {
    await owner.query(
      "INSERT INTO users(id,name,email,created_at) VALUES('boundary-from','From','from@example.com','2026-10-03T12:00:00Z'),('boundary-to','To','to@example.com','2026-10-10T12:00:00Z')",
    );
    expect((await service.overview("7d", now)).usersCreated).toBe(3);
  });
  it("returns every matching category when opaque IDs overlap", async () => {
    const sharedId = randomUUID();
    await owner.query(
      "INSERT INTO users(id,name,email) VALUES($1,'Shared','shared-id@example.com')",
      [sharedId],
    );
    await owner.query(
      "INSERT INTO projects(id,user_id,name,output_type,status) VALUES($1,$2,'Private title','clips','draft')",
      [sharedId, sharedId],
    );
    await owner.query(
      "INSERT INTO processing_jobs(id,project_id,user_id,type,status) VALUES($1,$2,$3,'render_clips','queued')",
      [sharedId, sharedId, sharedId],
    );
    const result = await service.search(sharedId);
    expect(result.users[0]?.id).toBe(sharedId);
    expect(result.projects[0]?.id).toBe(sharedId);
    expect(result.jobs[0]?.id).toBe(sharedId);
  });
});
