import { randomUUID } from "node:crypto";
import { resolve, join } from "node:path";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile, copyFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { loadWorkerConfig } from "@repurposepro/config";
import { CleanupWorkerService } from "../../../../worker/src/services/cleanup-worker.service";
import {
  removeCleanupAsset,
  type CleanupAsset,
} from "../../../../worker/src/services/storage-cleanup";
import { Queue } from "bullmq";
import { ClipPreviewsService } from "./clip-previews.service";
import type { DatabaseService } from "../infrastructure/database.service";
import type { LocalStorageService } from "../storage/local-storage.service";
import { vi } from "vitest";
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
  const legacyProject = randomUUID(),
    legacyVideo = randomUUID(),
    legacyOutput = randomUUID();
  const legacyDeadline = new Date("2026-01-01T00:00:00Z");
  const legacyOutputDeadline = new Date("2026-01-02T00:00:00Z");
  let baselineFolder: string | undefined;
  const admin = client(bootstrap),
    owner = client(migration, name);
  const runtime = client(runtimeUrl, name),
    processing = client(runtimeUrl, name, "repurposepro_processing");
  beforeAll(async () => {
    await admin.pool.query(`CREATE DATABASE ${name} OWNER repurposepro_owner`);
    baselineFolder = await mkdtemp(join(tmpdir(), "rp-retention-backfill-"));
    await mkdir(join(baselineFolder, "meta"));
    const journal = JSON.parse(
      await readFile(resolve("packages/db/drizzle/meta/_journal.json"), "utf8"),
    ) as { entries: { idx: number; tag: string }[] };
    journal.entries = journal.entries.filter((entry) => entry.idx < 44);
    await writeFile(join(baselineFolder, "meta", "_journal.json"), JSON.stringify(journal));
    for (const entry of journal.entries)
      await copyFile(
        resolve("packages/db/drizzle", `${entry.tag}.sql`),
        join(baselineFolder, `${entry.tag}.sql`),
      );
    await migrateDatabaseForTests(owner, baselineFolder);
    await owner.pool.query(
      "INSERT INTO users(id,name,email) VALUES('cleanup-owner','Cleanup','cleanup@example.test')",
    );
    await owner.pool.query(
      "INSERT INTO projects(id,user_id,name,output_type,status) VALUES($1,'cleanup-owner','Historical','clips','uploaded')",
      [legacyProject],
    );
    await owner.pool.query(
      "INSERT INTO uploaded_videos(id,project_id,original_file_name,storage_path,mime_type,file_size_bytes,duration_seconds,width,height,has_audio,expires_at) VALUES($1,$2,'legacy.mp4',$3,'video/mp4',10,60,1920,1080,true,$4)",
      [
        legacyVideo,
        legacyProject,
        `D:/private/users/cleanup-owner/projects/${legacyProject}/source/video`,
        legacyDeadline,
      ],
    );
    const legacyRender = randomUUID();
    await owner.pool.query(
      "INSERT INTO processing_jobs(id,project_id,user_id,type,status) VALUES($1,$2,'cleanup-owner','render_summary','completed')",
      [legacyRender, legacyProject],
    );
    await owner.pool.query(
      "INSERT INTO rendered_outputs(id,project_id,render_job_id,type,title,storage_path,file_name,file_size_bytes,duration_seconds,width,height,video_codec,audio_codec,expires_at) VALUES($1,$2,$3,'summary','Legacy export',$4,'summary.mp4',10,4,1080,1920,'h264','aac',$5)",
      [
        legacyOutput,
        legacyProject,
        legacyRender,
        `D:/private/users/cleanup-owner/projects/${legacyProject}/renders/${legacyRender}/summary/${randomUUID()}.mp4`,
        legacyOutputDeadline,
      ],
    );
    await migrateDatabaseForTests(owner, resolve("packages/db/drizzle"));
    const statement = await admin.pool.query<{ sql: string }>(
      "SELECT format('ALTER ROLE repurposepro_processing PASSWORD %L',$1::text) AS sql",
      [decodeURIComponent(new URL(runtimeUrl!).password)],
    );
    await admin.pool.query(statement.rows[0]!.sql);
    await owner.pool.query(
      "INSERT INTO stripe_payments(user_id,stripe_event_id,pack_code,amount_cents,currency,credits_granted,status) VALUES('cleanup-owner','evt_retention_fixture','starter',1900,'usd',100,'paid')",
    );
  });
  afterAll(async () => {
    await Promise.all([owner, runtime, processing].map(closeDatabaseClient));
    await admin.pool.query(`DROP DATABASE IF EXISTS ${name}`);
    await closeDatabaseClient(admin);
    if (baselineFolder) await rm(baselineFolder, { recursive: true, force: true });
  });
  async function source(expired = true, root = "D:/private") {
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
        join(root, "users", "cleanup-owner", "projects", project, "source", "video").replaceAll(
          "\\",
          "/",
        ),
        expired ? "-1 day" : "1 day",
      ],
    );
    return { project, video };
  }
  async function claim(token = randomUUID()) {
    return (
      await processing.pool.query<CleanupAsset & { id: string; asset_id: string | null }>(
        "SELECT * FROM public.claim_expired_storage_targets($1,$2)",
        [token, 100],
      )
    ).rows;
  }
  it("backfills existing media without extending its original deadline", async () => {
    const record = (
      await owner.pool.query<{ expires_at: Date; kind: string }>(
        "SELECT expires_at,kind FROM storage_cleanup_targets WHERE asset_id=$1",
        [legacyVideo],
      )
    ).rows[0]!;
    expect(record).toEqual({ expires_at: legacyDeadline, kind: "source" });
    expect(
      (
        await owner.pool.query(
          "SELECT expires_at,kind FROM storage_cleanup_targets WHERE asset_id=$1",
          [legacyOutput],
        )
      ).rows[0],
    ).toEqual({ expires_at: legacyOutputDeadline, kind: "output" });
    const token = randomUUID();
    const targets = await claim(token);
    const target = targets.find((t) => t.asset_id === legacyVideo)!;
    expect(target).toBeDefined();
    expect(targets.some((t) => t.asset_id === legacyOutput)).toBe(true);
    for (const target of targets)
      await processing.pool.query("SELECT finish_storage_cleanup($1,$2,true)", [target.id, token]);
  });
  it("recovers only old recognized orphan assets after their active owner releases its lease", async () => {
    const { project } = await source(false);
    const job = randomUUID(),
      token = randomUUID();
    await owner.pool.query(
      "INSERT INTO processing_jobs(id,project_id,user_id,type,status,execution_lease_token,execution_lease_owner,execution_lease_expires_at,execution_heartbeat_at) VALUES($1,$2,'cleanup-owner','render_summary','active',$3,'fixture',clock_timestamp()+interval '1 hour',clock_timestamp())",
      [job, project, token],
    );
    const old = new Date(Date.now() - 8 * 86400000);
    const path = `D:/private/.render-staging/${project}-${job}-Ab12xy`;
    const register = async (path: string, created = old) =>
      (
        await processing.pool.query<{ valid: boolean }>(
          "SELECT register_orphan_storage_target(NULL,$1,$2,7) AS valid",
          [path, created],
        )
      ).rows[0]!.valid;
    expect(await register(path)).toBe(false);
    expect(await register(`D:/private/.staging/${randomUUID()}`, new Date())).toBe(false);
    expect(await register("D:/private/models/model")).toBe(false);
    await owner.pool.query(
      "UPDATE processing_jobs SET execution_lease_expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",
      [job],
    );
    expect(await register(path)).toBe(true);
    expect(await register(path)).toBe(false);
    const result = (
      await owner.pool.query<{ expires_at: Date }>(
        "SELECT expires_at FROM storage_cleanup_targets WHERE storage_path=$1",
        [path],
      )
    ).rows[0];
    expect(result.expires_at).toEqual(new Date(old.getTime() + 7 * 86400000));
    const cleanupToken = randomUUID();
    for (const target of await claim(cleanupToken))
      await processing.pool.query("SELECT finish_storage_cleanup($1,$2,true)", [
        target.id,
        cleanupToken,
      ]);
  });
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
        await processing.pool.query<{ result: boolean }>(
          "SELECT public.finish_storage_cleanup($1,$2,true) AS result",
          [target.id, token],
        )
      ).rows[0]!.result;
    expect(await complete()).toBe(true);
    expect(await complete()).toBe(true);
    expect(
      (
        await owner.pool.query<{ deleted_at: Date | null }>(
          "SELECT deleted_at FROM uploaded_videos WHERE id=$1",
          [expired.video],
        )
      ).rows[0]!.deleted_at,
    ).not.toBeNull();
    expect(
      (
        await owner.pool.query<{ name: string; deleted_at: Date | null }>(
          "SELECT name,deleted_at FROM projects WHERE id=$1",
          [expired.project],
        )
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
        await processing.pool.query<{ result: boolean }>(
          "SELECT public.finish_storage_cleanup($1,$2,true) AS result",
          [target.id, first],
        )
      ).rows[0]!.result,
    ).toBe(false);
    expect(
      (
        await processing.pool.query<{ result: boolean }>(
          "SELECT public.finish_storage_cleanup($1,$2,true) AS result",
          [target.id, next],
        )
      ).rows[0]!.result,
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
  it("allows only one concurrent claim and recovers a crash after physical deletion", async () => {
    const root = await mkdtemp(join(tmpdir(), "rp-retention-crash-"));
    try {
      const { project, video } = await source(true, root);
      const path = join(root, "users", "cleanup-owner", "projects", project, "source");
      await mkdir(path, { recursive: true });
      await writeFile(join(path, "video"), "media");
      const tokens = [randomUUID(), randomUUID()];
      const results = await Promise.all(tokens.map(claim));
      const matches = results.flat().filter((t) => t.asset_id === video);
      expect(matches).toHaveLength(1);
      const target = matches[0]!;
      await removeCleanupAsset(root, target);
      await owner.pool.query(
        "UPDATE storage_cleanup_targets SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",
        [target.id],
      );
      const replacement = randomUUID();
      const recovered = (await claim(replacement)).find((t) => t.id === target.id)!;
      await removeCleanupAsset(root, recovered);
      expect(
        (
          await processing.pool.query<{ result: boolean }>(
            "SELECT finish_storage_cleanup($1,$2,true) result",
            [target.id, replacement],
          )
        ).rows[0]!.result,
      ).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  it("fences failed-upload path reuse and re-arms a completed temporary source", async () => {
    const project = randomUUID(),
      writer = randomUUID();
    const path = `D:/private/users/cleanup-owner/projects/${project}/source`;
    await owner.pool.query(
      "INSERT INTO projects(id,user_id,name,output_type,status) VALUES($1,'cleanup-owner','Draft','clips','draft')",
      [project],
    );
    await runtime.pool.query("SELECT register_upload_storage_target('cleanup-owner',$1,$2,$3,7)", [
      project,
      writer,
      `D:/private/.staging/${writer}`,
    ]);
    const register = async () =>
      (
        await runtime.pool.query<{ id: string | null }>(
          "SELECT register_upload_storage_aux('cleanup-owner',$1,$2,7) id",
          [project, path],
        )
      ).rows[0]!.id;
    const id = await register();
    expect(id).not.toBeNull();
    await owner.pool.query(
      "UPDATE storage_cleanup_targets SET writer_expires_at=NULL,expires_at=clock_timestamp()-interval '1 day' WHERE id=$1",
      [id],
    );
    const token = randomUUID();
    expect((await claim(token)).some((t) => t.id === id)).toBe(true);
    expect(await register()).toBeNull();
    await processing.pool.query("SELECT finish_storage_cleanup($1,$2,true)", [id, token]);
    expect(await register()).toBe(id);
    expect(
      (
        await owner.pool.query<{
          deleted_at: Date | null;
          future: boolean;
          lease_token: string | null;
        }>(
          "SELECT deleted_at,expires_at>clock_timestamp() future,lease_token FROM storage_cleanup_targets WHERE id=$1",
          [id],
        )
      ).rows[0],
    ).toMatchObject({ deleted_at: null, future: true, lease_token: null });
    await expect(
      runtime.pool
        .query("SELECT register_upload_storage_aux('foreign',$1,$2,7)", [project, path])
        .then((r) => r.rows[0] as unknown),
    ).resolves.toEqual({ register_upload_storage_aux: null });
  });
  it("sweeps independent source, audio, staging, clip and summary targets while preserving history and fresh files", async () => {
    const root = await mkdtemp(join(tmpdir(), "rp-retention-sweep-"));
    try {
      const { project, video } = await source(true, root);
      const base = join(root, "users", "cleanup-owner", "projects", project);
      const analysis = randomUUID(),
        transcript = randomUUID(),
        clip = randomUUID();
      await owner.pool.query(
        "INSERT INTO processing_jobs(id,project_id,user_id,type,status,credits_charged) VALUES($1,$2,'cleanup-owner','analyze_video','completed',1)",
        [analysis, project],
      );
      await owner.pool.query(
        "INSERT INTO transcripts(id,project_id,processing_job_id,uploaded_video_id,language,model,duration_seconds,text) VALUES($1,$2,$3,$4,'en','fixture',60,'Retained transcript')",
        [transcript, project, analysis, video],
      );
      await owner.pool.query("UPDATE projects SET current_analysis_job_id=$1 WHERE id=$2", [
        analysis,
        project,
      ]);
      await owner.pool.query(
        "INSERT INTO clip_candidates(id,project_id,processing_job_id,transcript_id,kind,rank,title,reason,start_time,end_time,score,caption_lines,caption_position) VALUES($1,$2,$3,$4,'primary',0,'Retained clip','Fixture',1,5,0.9,'[]',$5)",
        [clip, project, analysis, transcript, JSON.stringify({ x: 0.5, y: 0.7 })],
      );
      await owner.pool.query(
        "INSERT INTO credit_ledger(user_id,type,amount,project_id,processing_job_id,description,idempotency_key) VALUES('cleanup-owner','processing_deduction',-1,$1,$2,'Retained deduction',$3)",
        [project, analysis, randomUUID()],
      );
      const sourcePath = join(base, "source");
      await mkdir(join(sourcePath, ".analysis"), { recursive: true });
      await writeFile(join(sourcePath, "video"), "source");
      await writeFile(join(sourcePath, "preview.mp4"), "preview media");
      const audioPath = join(sourcePath, ".analysis", `${analysis}-${randomUUID()}-1.wav`);
      const stagingPath = join(root, ".staging", randomUUID());
      const renderPath = join(
        root,
        ".render-staging",
        `${analysis}-${randomUUID()}-${randomUUID()}`,
      );
      for (const [kind, path] of [
        ["audio", audioPath],
        ["upload_temp", stagingPath],
        ["render_temp", renderPath],
      ] as const) {
        await mkdir(join(path, ".."), { recursive: true });
        if (kind === "render_temp") {
          await mkdir(path);
          await writeFile(join(path, "media"), "temporary");
        } else await writeFile(path, "temporary");
        await owner.pool.query(
          "INSERT INTO storage_cleanup_targets(kind,project_id,user_id,storage_path,expires_at) VALUES($1,$2,'cleanup-owner',$3,clock_timestamp()-interval '1 day')",
          [kind, project, path.replaceAll("\\", "/")],
        );
      }
      const outputPaths: string[] = [];
      for (const [type, expired] of [
        ["clip", true],
        ["summary", true],
        ["summary", false],
      ] as const) {
        const job = randomUUID(),
          path = join(
            base,
            "renders",
            job,
            type === "clip" ? clip : "summary",
            `${randomUUID()}.mp4`,
          );
        outputPaths.push(path);
        await mkdir(join(path, ".."), { recursive: true });
        await writeFile(path, "export");
        await owner.pool.query(
          "INSERT INTO processing_jobs(id,project_id,user_id,type,status) VALUES($1,$2,'cleanup-owner',$3,'completed')",
          [job, project, type === "clip" ? "render_clips" : "render_summary"],
        );
        await owner.pool.query(
          "INSERT INTO rendered_outputs(project_id,render_job_id,clip_candidate_id,type,title,storage_path,file_name,file_size_bytes,duration_seconds,width,height,video_codec,audio_codec,expires_at) VALUES($1,$2,$3,$4,'Export',$5,'export.mp4',10,4,1080,1920,'h264','aac',clock_timestamp()+$6::interval)",
          [
            project,
            job,
            type === "clip" ? clip : null,
            type,
            path.replaceAll("\\", "/"),
            expired ? "-1 day" : "1 day",
          ],
        );
      }
      const history = async () =>
        (
          await owner.pool.query<{ history: unknown }>(
            "SELECT jsonb_build_object('project',(SELECT to_jsonb(p) FROM projects p WHERE id=$1),'jobs',(SELECT jsonb_agg(to_jsonb(j) ORDER BY id) FROM processing_jobs j WHERE project_id=$1),'transcripts',(SELECT jsonb_agg(to_jsonb(t)) FROM transcripts t WHERE project_id=$1),'clips',(SELECT jsonb_agg(to_jsonb(c)) FROM clip_candidates c WHERE project_id=$1),'ledger',(SELECT jsonb_agg(to_jsonb(l)) FROM credit_ledger l WHERE project_id=$1),'payments',(SELECT jsonb_agg(to_jsonb(s)) FROM stripe_payments s),'intents',(SELECT jsonb_agg(to_jsonb(i)) FROM processing_failure_intents i)) history",
            [project],
          )
        ).rows[0]!.history;
      const before = await history();
      const service = new CleanupWorkerService(processing, {
        ...loadWorkerConfig(),
        storageRoot: root,
      });
      expect((await service.sweep()).deleted).toBe(6);
      expect((await service.sweep()).deleted).toBe(0);
      expect(await history()).toEqual(before);
      expect(await readFile(outputPaths[2]!, "utf8")).toBe("export");
      for (const path of [
        join(sourcePath, "video"),
        audioPath,
        stagingPath,
        join(renderPath, "media"),
        ...outputPaths.slice(0, 2),
      ])
        await expect(readFile(path)).rejects.toThrow();
      const listed = (
        await runtime.pool.query<{ result: { status: string; deletedAt: string | null }[] }>(
          "SELECT list_owned_render_outputs('cleanup-owner',$1) result",
          [project],
        )
      ).rows[0]!.result;
      expect(listed.filter((o) => o.status === "expired" && o.deletedAt)).toHaveLength(2);
      for (const expression of [
        "start_owned_clip_batch_render('cleanup-owner',$1,'[]'::jsonb,'expired')",
        "start_owned_summary_render('cleanup-owner',$1,0,'expired')",
        "start_owned_clip_regeneration('cleanup-owner',$1,$2,0,'expired')",
        "owned_video_framing('cleanup-owner',$1,true)",
      ]) {
        const values = expression.includes("$2") ? [project, clip] : [project];
        const result = (
          await runtime.pool.query<{ result: { error: string } }>(
            `SELECT ${expression} AS result`,
            values,
          )
        ).rows[0]!.result;
        expect(result).toEqual({ error: "SOURCE_VIDEO_EXPIRED" });
      }
      expect(
        (
          await processing.pool.query<{ outcome: string }>(
            "SELECT * FROM start_paid_video_analysis('cleanup-owner',$1)",
            [project],
          )
        ).rows[0]!.outcome,
      ).toBe("video_expired");
      expect(
        (
          await processing.pool.query<{ outcome: string }>(
            "SELECT * FROM start_paid_video_analysis('foreign',$1)",
            [project],
          )
        ).rows[0]!.outcome,
      ).toBe("project_not_found");
      const readSourceUpload = vi.fn();
      const previews = new ClipPreviewsService(
        { database: runtime } as unknown as DatabaseService,
        { readSourceUpload } as unknown as LocalStorageService,
      );
      await expect(previews.getSourceVideoContent("cleanup-owner", project)).rejects.toMatchObject({
        code: "SOURCE_VIDEO_EXPIRED",
      });
      expect(readSourceUpload).not.toHaveBeenCalled();
      expect((await previews.list("cleanup-owner", project)).clips).toHaveLength(1);
      expect(
        (
          await runtime.pool.query(
            "SELECT * FROM get_owned_source_video_content('cleanup-owner',$1)",
            [project],
          )
        ).rowCount,
      ).toBe(1);
      expect(
        (
          await runtime.pool.query("SELECT * FROM get_owned_source_video_content('foreign',$1)", [
            project,
          ])
        ).rowCount,
      ).toBe(0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  it("routes expired queued analysis through the existing refund intent without cleanup charging or refunding", async () => {
    const { project } = await source();
    const job = randomUUID();
    await owner.pool.query(
      "INSERT INTO processing_jobs(id,project_id,user_id,type,status,credits_charged) VALUES($1,$2,'cleanup-owner','analyze_video','queued',1)",
      [job, project],
    );
    await owner.pool.query("UPDATE projects SET current_job_id=$1,status='queued' WHERE id=$2", [
      job,
      project,
    ]);
    await owner.pool.query(
      "INSERT INTO credit_ledger(user_id,type,amount,project_id,processing_job_id,description,idempotency_key) VALUES('cleanup-owner','processing_deduction',-1,$1,$2,'Analysis',$3)",
      [project, job, randomUUID()],
    );
    expect(
      (
        await processing.pool.query<{ outcome: string }>(
          "SELECT * FROM acquire_analysis_execution_lease($1,$2,'fixture')",
          [job, project],
        )
      ).rows[0]!.outcome,
    ).toBe("rejected");
    expect(
      (
        await owner.pool.query<{ failure_code: string }>(
          "SELECT failure_code FROM processing_failure_intents WHERE processing_job_id=$1",
          [job],
        )
      ).rows[0]!.failure_code,
    ).toBe("STORAGE_FAILED");
    expect(
      (
        await owner.pool.query<{ count: string }>(
          "SELECT count(*) FROM credit_ledger WHERE processing_job_id=$1",
          [job],
        )
      ).rows[0]!.count,
    ).toBe("1");
    expect(
      (
        await processing.pool.query<{ outcome: string; refunded_credits: number }>(
          "SELECT * FROM finalize_failed_processing_job($1,'STORAGE_FAILED','The source video expired before processing could finish.')",
          [job],
        )
      ).rows[0],
    ).toMatchObject({ outcome: "refunded", refunded_credits: 1 });
    expect(
      (
        await processing.pool.query<{ outcome: string }>(
          "SELECT * FROM finalize_failed_processing_job($1,'STORAGE_FAILED','The source video expired before processing could finish.')",
          [job],
        )
      ).rows[0]!.outcome,
    ).toBe("already_refunded");
    const token = randomUUID();
    for (const target of await claim(token))
      await processing.pool.query("SELECT finish_storage_cleanup($1,$2,true)", [target.id, token]);
  });
  it("records individual filesystem failure and retries without confirming deletion", async () => {
    const root = await mkdtemp(join(tmpdir(), "rp-retention-failure-"));
    try {
      const { project, video } = await source(true, root);
      const path = join(root, "users", "cleanup-owner", "projects", project, "source");
      const outside = join(root, "keep");
      await mkdir(path, { recursive: true });
      await mkdir(outside);
      await writeFile(join(outside, "safe"), "keep");
      await symlink(outside, join(path, "redirect"), "junction");
      const service = new CleanupWorkerService(processing, {
        ...loadWorkerConfig(),
        storageRoot: root,
      });
      await expect(service.sweep()).rejects.toThrow(/another cleanup attempt/);
      expect(
        (
          await owner.pool.query<{ deleted_at: Date | null }>(
            "SELECT deleted_at FROM uploaded_videos WHERE id=$1",
            [video],
          )
        ).rows[0]!.deleted_at,
      ).toBeNull();
      expect(await readFile(join(outside, "safe"), "utf8")).toBe("keep");
      await rm(join(path, "redirect"), { recursive: true, force: true });
      await owner.pool.query(
        "UPDATE storage_cleanup_targets SET next_attempt_at=clock_timestamp() WHERE asset_id=$1",
        [video],
      );
      expect((await service.sweep()).deleted).toBe(1);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  it("upserts one UTC scheduler and deduplicates startup sweeps across restart", async () => {
    const root = await mkdtemp(join(tmpdir(), "rp-retention-schedule-"));
    const config = {
      ...loadWorkerConfig(),
      storageRoot: root,
      redisUrl: process.env.TEST_REDIS_URL!,
      bullmqPrefix: `rp-cleanup-${randomUUID()}`,
    };
    const queue = new Queue("cleanup-queue", {
      connection: { url: config.redisUrl },
      prefix: config.bullmqPrefix,
    });
    const workerDatabases: ReturnType<typeof client>[] = [];
    const start = () => {
      const database = client(runtimeUrl, name, "repurposepro_processing");
      workerDatabases.push(database);
      return new CleanupWorkerService(database, config);
    };
    const first = start();
    let firstClosed = false;
    let second: CleanupWorkerService | undefined;
    try {
      await first.onModuleInit();
      await first.onModuleDestroy();
      firstClosed = true;
      second = start();
      await second.onModuleInit();
      const schedulers = await queue.getJobSchedulers();
      expect(schedulers).toHaveLength(1);
      expect(schedulers[0]).toMatchObject({
        key: "expired-media-hourly",
        pattern: "0 * * * *",
        tz: "UTC",
      });
      const job = await queue.getJob(`startup-${Math.floor(Date.now() / 3_600_000)}`);
      expect(job?.opts).toMatchObject({
        attempts: 4,
        backoff: { type: "exponential", delay: 30000 },
      });
      expect(
        (await queue.getJobs(["completed", "waiting", "active", "delayed"])).filter((j) =>
          j.id?.startsWith("startup-"),
        ),
      ).toHaveLength(1);
    } finally {
      if (!firstClosed) await first.onModuleDestroy();
      await second?.onModuleDestroy();
      expect(workerDatabases.map((database) => database.pool.totalCount)).toEqual([0, 0]);
      await queue.obliterate({ force: true });
      await queue.close();
      await rm(root, { recursive: true, force: true });
    }
  });
});
