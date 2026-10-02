import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  closeDatabaseClient,
  createDatabaseClient,
  migrateDatabaseForTests,
} from "@repurposepro/db";

const bootstrap = process.env.TEST_DATABASE_BOOTSTRAP_URL;
const migration = process.env.TEST_DATABASE_MIGRATION_URL;
const runtimeUrl = process.env.TEST_DATABASE_RUNTIME_URL;
const suite = bootstrap && migration && runtimeUrl ? describe : describe.skip;
const name = `repurposepro_cleanup_${randomUUID().replaceAll("-", "")}`;
function client(url: string | undefined, database?: string, role?: string) {
  const value = new URL(url ?? "postgresql://localhost/postgres");
  if (database) value.pathname = `/${database}`;
  if (role) value.username = role;
  return createDatabaseClient({ connectionString: value.toString(), poolMax: 3, ssl: false });
}

suite("durable file cleanup", () => {
  const admin = client(bootstrap),
    owner = client(migration, name);
  const runtime = client(runtimeUrl, name),
    processing = client(runtimeUrl, name, "repurposepro_processing");
  beforeAll(async () => {
    await admin.pool.query(`CREATE DATABASE ${name} OWNER repurposepro_owner`);
    await migrateDatabaseForTests(owner, resolve("packages/db/drizzle"));
    const statement = await admin.pool.query<{ sql: string }>(
      "SELECT format('ALTER ROLE repurposepro_processing PASSWORD %L',$1::text) AS sql",
      [decodeURIComponent(new URL(runtimeUrl!).password)],
    );
    await admin.pool.query(statement.rows[0]!.sql);
    await owner.pool.query(
      "INSERT INTO users(id,name,email) VALUES('cleanup-owner','Cleanup','cleanup@example.test')",
    );
  });
  afterAll(async () => {
    await Promise.all([owner, runtime, processing].map(closeDatabaseClient));
    await admin.pool.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    await closeDatabaseClient(admin);
  });
  async function source(expired = true) {
    const project = randomUUID(),
      video = randomUUID();
    await owner.pool.query(
      "INSERT INTO projects(id,user_id,name,output_type,status) VALUES($1,'cleanup-owner','Retained history','clips','uploaded')",
      [project],
    );
    await owner.pool.query(
      "INSERT INTO uploaded_videos(id,project_id,original_file_name,storage_path,mime_type,file_size_bytes,duration_seconds,width,height,has_audio,expires_at) VALUES($1,$2,'video.mp4',$3,'video/mp4',10,60,1920,1080,true,clock_timestamp()+$4::interval)",
      [
        video,
        project,
        `D:/private/users/cleanup-owner/projects/${project}/source/video`,
        expired ? "-1 day" : "1 day",
      ],
    );
    return { project, video };
  }
  async function claim(token = randomUUID()) {
    return (
      await processing.pool.query("SELECT * FROM public.claim_expired_storage_targets($1,$2)", [
        token,
        100,
      ])
    ).rows;
  }
  it("claims expired files without extending deadlines, and retains project metadata after deletion", async () => {
    const expired = await source(),
      fresh = await source(false);
    const token = randomUUID(),
      targets = await claim(token);
    expect(targets.map((t) => t.asset_id)).toContain(expired.video);
    expect(targets.map((t) => t.asset_id)).not.toContain(fresh.video);
    const target = targets.find((t) => t.asset_id === expired.video)!;
    expect(await claim()).toHaveLength(0);
    const complete = async () =>
      (
        await processing.pool.query("SELECT public.finish_storage_cleanup($1,$2,true) AS result", [
          target.id,
          token,
        ])
      ).rows[0].result;
    expect(await complete()).toBe(true);
    expect(await complete()).toBe(true);
    expect(
      (
        await owner.pool.query("SELECT deleted_at FROM uploaded_videos WHERE id=$1", [
          expired.video,
        ])
      ).rows[0].deleted_at,
    ).not.toBeNull();
    expect(
      (
        await owner.pool.query("SELECT name,deleted_at FROM projects WHERE id=$1", [
          expired.project,
        ])
      ).rows[0],
    ).toEqual({ name: "Retained history", deleted_at: null });
  });
  it("defers live processing leases and recovers expired cleanup claims", async () => {
    const { project, video } = await source();
    const job = randomUUID();
    await owner.pool.query(
      "INSERT INTO processing_jobs(id,project_id,user_id,type,status,execution_lease_token,execution_lease_owner,execution_lease_expires_at,execution_heartbeat_at) VALUES($1,$2,'cleanup-owner','analyze_video','active',$3,'fixture',clock_timestamp()+interval '1 hour',clock_timestamp())",
      [job, project, randomUUID()],
    );
    expect((await claim()).some((t) => t.asset_id === video)).toBe(false);
    await owner.pool.query(
      "UPDATE processing_jobs SET execution_lease_expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",
      [job],
    );
    const first = randomUUID(),
      target = (await claim(first)).find((t) => t.asset_id === video)!;
    expect(target).toBeDefined();
    await owner.pool.query(
      "UPDATE storage_cleanup_targets SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",
      [target.id],
    );
    const next = randomUUID();
    expect((await claim(next)).some((t) => t.id === target.id)).toBe(true);
    expect(
      (
        await processing.pool.query("SELECT public.finish_storage_cleanup($1,$2,true) AS result", [
          target.id,
          first,
        ])
      ).rows[0].result,
    ).toBe(false);
    expect(
      (
        await processing.pool.query("SELECT public.finish_storage_cleanup($1,$2,true) AS result", [
          target.id,
          next,
        ])
      ).rows[0].result,
    ).toBe(true);
  });
  it("restricts cleanup to processing identity and cannot modify the ledger", async () => {
    await expect(
      runtime.pool.query("SELECT * FROM public.claim_expired_storage_targets($1,100)", [
        randomUUID(),
      ]),
    ).rejects.toThrow(/permission denied/);
    await expect(processing.pool.query("DELETE FROM credit_ledger")).rejects.toThrow(
      /permission denied/,
    );
    await expect(processing.pool.query("SELECT * FROM storage_cleanup_targets")).rejects.toThrow(
      /permission denied/,
    );
  });
});
