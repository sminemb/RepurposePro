import { randomUUID } from "node:crypto";
import { resolve, join } from "node:path";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createDatabaseClient,
  closeDatabaseClient,
  migrateDatabaseForTests,
} from "@repurposepro/db";
import {
  removeCleanupAsset,
  type CleanupAsset,
} from "../../../../worker/src/services/storage-cleanup";

const bootstrap = process.env.TEST_DATABASE_BOOTSTRAP_URL;
const migration = process.env.TEST_DATABASE_MIGRATION_URL;
const runtimeUrl = process.env.TEST_DATABASE_RUNTIME_URL;
const suite = bootstrap && migration && runtimeUrl ? describe : describe.skip;
type TestRow = { result: unknown; count: string; clips: unknown[]; deleted_at: Date | null };
const name = `repurposepro_delete_${randomUUID().replaceAll("-", "")}`;
function client(url: string | undefined, database?: string, role?: string) {
  const value = new URL(url ?? "postgresql://localhost/postgres");
  if (database) value.pathname = `/${database}`;
  if (role) value.username = role;
  return createDatabaseClient({ connectionString: value.toString(), poolMax: 3, ssl: false });
}
suite("project and bulk clip deletion", () => {
  const admin = client(bootstrap),
    owner = client(migration, name);
  const runtime = client(runtimeUrl, name),
    processing = client(runtimeUrl, name, "repurposepro_processing");
  let root: string;
  beforeAll(async () => {
    await admin.pool.query<TestRow>(`CREATE DATABASE ${name} OWNER repurposepro_owner`);
    await migrateDatabaseForTests(owner, resolve("packages/db/drizzle"));
    const statement = await admin.pool.query<{ sql: string }>(
      "SELECT format('ALTER ROLE repurposepro_processing PASSWORD %L',$1::text) AS sql",
      [decodeURIComponent(new URL(runtimeUrl!).password)],
    );
    await admin.pool.query<TestRow>(statement.rows[0]!.sql);
    await owner.pool.query<TestRow>(
      "INSERT INTO users(id,name,email) VALUES('delete-owner','Delete','delete@example.test')",
    );
    await owner.pool.query<TestRow>(
      "INSERT INTO stripe_payments(user_id,stripe_event_id,pack_code,amount_cents,currency,credits_granted,status) VALUES('delete-owner','evt_delete_fixture','starter',1900,'usd',100,'paid')",
    );
    root = await mkdtemp(join(tmpdir(), "rp-project-delete-"));
  });
  afterAll(async () => {
    await Promise.all([owner, runtime, processing].map(closeDatabaseClient));
    await admin.pool.query<TestRow>(`DROP DATABASE IF EXISTS ${name}`);
    await closeDatabaseClient(admin);
    if (root) await rm(root, { recursive: true, force: true });
  });
  async function fixture() {
    const project = randomUUID(),
      video = randomUUID(),
      analysis = randomUUID(),
      transcript = randomUUID();
    const directory = join(root, "users", "delete-owner", "projects", project);
    await mkdir(join(directory, "source"), { recursive: true });
    await writeFile(join(directory, "source", "video"), "media");
    await owner.pool.query<TestRow>(
      "INSERT INTO projects(id,user_id,name,output_type,status) VALUES($1,'delete-owner','Delete test','clips','preview_ready')",
      [project],
    );
    await owner.pool.query<TestRow>(
      "INSERT INTO uploaded_videos(id,project_id,original_file_name,storage_path,mime_type,file_size_bytes,duration_seconds,width,height,has_audio,expires_at) VALUES($1,$2,'source.mp4',$3,'video/mp4',1000,30,1920,1080,true,now()+interval '1 day')",
      [video, project, join(directory, "source", "video").replaceAll("\\", "/")],
    );
    await owner.pool.query<TestRow>(
      "INSERT INTO processing_jobs(id,project_id,user_id,type,status) VALUES($1,$2,'delete-owner','analyze_video','completed')",
      [analysis, project],
    );
    await owner.pool.query<TestRow>(
      "UPDATE projects SET current_job_id=$2,current_analysis_job_id=$2 WHERE id=$1",
      [project, analysis],
    );
    await owner.pool.query<TestRow>(
      "INSERT INTO transcripts(id,project_id,processing_job_id,uploaded_video_id,language,model,duration_seconds,text) VALUES($1,$2,$3,$4,'en','fixture',30,'Clip')",
      [transcript, project, analysis, video],
    );
    const clips = Array.from({ length: 5 }, () => ({ id: randomUUID(), expectedRevision: 0 }));
    for (const [rank, clip] of clips.entries())
      await owner.pool.query<TestRow>(
        "INSERT INTO clip_candidates(id,project_id,processing_job_id,transcript_id,kind,rank,title,reason,start_time,end_time,score,caption_lines,caption_position) VALUES($1,$2,$3,$4,'primary',$5,'Clip','Fixture',1,5,0.9,'[]'::jsonb,'{\"x\":0.5,\"y\":0.72}'::jsonb)",
        [clip.id, project, analysis, transcript, rank],
      );
    return { project, video, analysis, directory, clips };
  }
  async function deleteProject(project: string, directory: string, user = "delete-owner") {
    return (
      await runtime.pool.query<TestRow>("SELECT public.delete_owned_project($1,$2,$3) AS result", [
        user,
        project,
        directory.replaceAll("\\", "/"),
      ])
    ).rows[0].result;
  }
  async function deleteClips(project: string, clips: unknown, user = "delete-owner") {
    return (
      await runtime.pool.query<TestRow>(
        "SELECT public.delete_owned_clip_candidates($1,$2,$3::jsonb) AS result",
        [user, project, JSON.stringify(clips)],
      )
    ).rows[0].result;
  }
  it("rejects foreign ownership and leaves every clip intact on a revision conflict", async () => {
    const { project, directory, clips } = await fixture();
    expect(await deleteProject(project, directory, "foreign")).toEqual({
      error: "PROJECT_NOT_FOUND",
    });
    expect(await deleteClips(project, clips, "foreign")).toEqual({ error: "CLIP_NOT_FOUND" });
    expect(await deleteClips(project, [clips[0], { ...clips[1], expectedRevision: 1 }])).toEqual({
      error: "CLIP_EDIT_CONFLICT",
    });
    for (const batch of [[], [clips[0], clips[0]], [{ ...clips[0], expectedRevision: -1 }]])
      expect(await deleteClips(project, batch)).toEqual({ error: "VALIDATION_ERROR" });
    expect(
      (
        await owner.pool.query<TestRow>(
          "SELECT count(*) FROM clip_candidates WHERE project_id=$1 AND deleted_at IS NULL",
          [project],
        )
      ).rows[0].count,
    ).toBe("5");
    expect(
      await deleteClips(project, [clips[0], { id: randomUUID(), expectedRevision: 0 }]),
    ).toEqual({ error: "CLIP_NOT_FOUND" });
  });
  it("preserves the expired framing response and serializes framing startup against deletion", async () => {
    const f = await fixture();
    await owner.pool.query(
      "UPDATE uploaded_videos SET expires_at=now()-interval '1 second' WHERE id=$1",
      [f.video],
    );
    expect(
      (
        await runtime.pool.query<TestRow>(
          "SELECT owned_video_framing('delete-owner',$1,true) AS result",
          [f.project],
        )
      ).rows[0].result,
    ).toEqual({ error: "SOURCE_VIDEO_EXPIRED" });
    const fresh = await fixture();
    const [framing, deletion] = await Promise.all([
      runtime.pool.query<TestRow>("SELECT owned_video_framing('delete-owner',$1,true) AS result", [
        fresh.project,
      ]),
      deleteProject(fresh.project, fresh.directory),
    ]);
    if (framing.rows[0].result === null) expect(deletion).toEqual({});
    else expect(deletion).toEqual({ error: "PROJECT_BUSY" });
  });
  it("deletes a subset and then all remaining clips while retaining source and exports", async () => {
    const { project, clips, video } = await fixture();
    expect(await deleteClips(project, clips.slice(0, 2))).toEqual({});
    expect(
      (
        await runtime.pool.query<TestRow>(
          "SELECT * FROM list_owned_project_clip_candidates('delete-owner',$1)",
          [project],
        )
      ).rows[0].clips,
    ).toHaveLength(3);
    expect(await deleteClips(project, clips)).toEqual({});
    expect(await deleteClips(project, clips)).toEqual({});
    expect(
      (
        await owner.pool.query<TestRow>("SELECT deleted_at FROM uploaded_videos WHERE id=$1", [
          video,
        ])
      ).rows[0].deleted_at,
    ).toBeNull();
  });
  it("blocks queued jobs, live uploads, and queued framing before deleting an idle project", async () => {
    const { project, directory, video } = await fixture();
    const job = randomUUID();
    await owner.pool.query<TestRow>(
      "INSERT INTO processing_jobs(id,project_id,user_id,type,status) VALUES($1,$2,'delete-owner','render_clips','queued')",
      [job, project],
    );
    expect(await deleteProject(project, directory)).toEqual({ error: "PROJECT_BUSY" });
    await owner.pool.query<TestRow>("UPDATE processing_jobs SET status='completed' WHERE id=$1", [
      job,
    ]);
    const writer = randomUUID();
    await owner.pool.query<TestRow>(
      "INSERT INTO storage_cleanup_targets(kind,project_id,user_id,storage_path,expires_at,writer_token,writer_expires_at) VALUES('upload_temp',$1,'delete-owner',$2,now()+interval '1 day',$3,now()+interval '1 minute')",
      [project, join(root, ".staging", writer).replaceAll("\\", "/"), writer],
    );
    expect(await deleteProject(project, directory)).toEqual({ error: "PROJECT_BUSY" });
    await owner.pool.query<TestRow>(
      "UPDATE storage_cleanup_targets SET writer_expires_at=NULL WHERE writer_token=$1",
      [writer],
    );
    await owner.pool.query<TestRow>(
      "INSERT INTO video_framing(uploaded_video_id,version,status) VALUES($1,'mediapipe-v1','queued')",
      [video],
    );
    expect(await deleteProject(project, directory)).toEqual({ error: "PROJECT_BUSY" });
    await owner.pool.query<TestRow>(
      "UPDATE video_framing SET status='completed' WHERE uploaded_video_id=$1",
      [video],
    );
    expect(await deleteProject(project, directory)).toEqual({});
    expect(await deleteProject(project, directory)).toEqual({});
    expect(
      (
        await runtime.pool.query<TestRow>(
          "SELECT get_owned_clip_editor('delete-owner',$1,$2) AS result",
          [project, randomUUID()],
        )
      ).rows[0].result,
    ).toBeNull();
    expect(
      (
        await runtime.pool.query<TestRow>(
          "SELECT owned_video_framing('delete-owner',$1,true) AS result",
          [project],
        )
      ).rows[0].result,
    ).toBeNull();
    expect(
      (
        await runtime.pool.query<TestRow>(
          "SELECT list_owned_render_outputs('delete-owner',$1) AS result",
          [project],
        )
      ).rows[0].result,
    ).toBeNull();
  });
  it("durably retries cleanup and preserves billing and neighboring media", async () => {
    const { project, directory } = await fixture();
    const neighbor = await fixture();
    expect(await deleteProject(project, directory)).toEqual({});
    let token = randomUUID();
    const claimed = (
      await processing.pool.query<CleanupAsset & { id: string }>(
        "SELECT * FROM claim_expired_storage_targets($1,100)",
        [token],
      )
    ).rows;
    const target = claimed.find((t) => t.kind === "project" && t.project_id === project)!;
    expect(target).toBeDefined();
    await processing.pool.query<TestRow>("SELECT finish_storage_cleanup($1,$2,false)", [
      target.id,
      token,
    ]);
    await owner.pool.query<TestRow>(
      "UPDATE storage_cleanup_targets SET next_attempt_at=now() WHERE id=$1",
      [target.id],
    );
    token = randomUUID();
    const retry = (
      await processing.pool.query<CleanupAsset & { id: string }>(
        "SELECT * FROM claim_expired_storage_targets($1,100)",
        [token],
      )
    ).rows.find((t) => t.id === target.id)!;
    await removeCleanupAsset(root, retry);
    await processing.pool.query<TestRow>("SELECT finish_storage_cleanup($1,$2,true)", [
      retry.id,
      token,
    ]);
    await expect(readFile(join(directory, "source", "video"))).rejects.toThrow();
    expect(await readFile(join(neighbor.directory, "source", "video"), "utf8")).toBe("media");
    expect(
      (
        await owner.pool.query<TestRow>(
          "SELECT count(*) FROM stripe_payments WHERE user_id='delete-owner'",
        )
      ).rows[0].count,
    ).toBe("1");
    expect(
      (
        await owner.pool.query<TestRow>(
          "SELECT deleted_at FROM storage_cleanup_targets WHERE id=$1",
          [retry.id],
        )
      ).rows[0].deleted_at,
    ).not.toBeNull();
  });
});
