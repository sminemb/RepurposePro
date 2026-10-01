import { randomUUID } from "node:crypto";
import { resolve, join } from "node:path";
import { mkdir, mkdtemp, rm, stat } from "node:fs/promises";
import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import {
  createDatabaseClient,
  closeDatabaseClient,
  migrateDatabaseForTests,
} from "@repurposepro/db";
import { loadWorkerConfig } from "@repurposepro/config";
import type { RenderSnapshot } from "@repurposepro/shared";
import Redis from "ioredis";
import { RenderWorkerService } from "../../../../worker/src/services/render-worker.service";
import { runMedia } from "../../../../worker/src/services/render-ffmpeg";
import { RenderDispatcherService } from "./render-dispatcher.service";
import { BullMqConnectionFactory } from "../infrastructure/bullmq-connection.factory";
import type { ScopedDatabaseService } from "../infrastructure/database.service";

const bootstrap = process.env.TEST_DATABASE_BOOTSTRAP_URL;
const migration = process.env.TEST_DATABASE_MIGRATION_URL;
const runtimeUrl = process.env.TEST_DATABASE_RUNTIME_URL;
const suite = bootstrap && migration && runtimeUrl ? describe : describe.skip;
const database = `repurposepro_render_${randomUUID().replaceAll("-", "")}`;
function client(url: string | undefined, role?: string, name?: string) {
  const target = new URL(url ?? "postgresql://localhost/postgres");
  if (role) target.username = role;
  if (name) target.pathname = `/${name}`;
  return createDatabaseClient({ connectionString: target.toString(), poolMax: 3, ssl: false });
}
suite("saved one clip renders", () => {
  const admin = client(bootstrap),
    owner = client(migration, undefined, database),
    runtime = client(runtimeUrl, undefined, database),
    processing = client(runtimeUrl, "repurposepro_processing", database);
  const project = randomUUID(),
    video = randomUUID(),
    analysis = randomUUID(),
    transcript = randomUUID(),
    clip = randomUUID();
  let renderJob: string;
  const aliasKey = randomUUID();
  beforeAll(async () => {
    const sql = async (template: string) =>
      (
        await admin.pool.query<{ sql: string }>("SELECT format($1::text,$2::text) AS sql", [
          template,
          database,
        ])
      ).rows[0]!.sql;
    await admin.pool.query(await sql("CREATE DATABASE %I OWNER repurposepro_owner"));
    await migrateDatabaseForTests(owner, resolve("packages/db/drizzle"));
    const password = decodeURIComponent(new URL(runtimeUrl!).password);
    const statement = await admin.pool.query<{ sql: string }>(
      "SELECT format('ALTER ROLE repurposepro_processing PASSWORD %L',$1::text) AS sql",
      [password],
    );
    await admin.pool.query(statement.rows[0]!.sql);
    await owner.pool.query(
      "INSERT INTO users(id,name,email) VALUES('render-owner','Render','render@example.test')",
    );
    await owner.pool.query(
      "INSERT INTO projects(id,user_id,name,output_type,status) VALUES($1,'render-owner','Render','clips','preview_ready')",
      [project],
    );
    await owner.pool.query(
      "INSERT INTO uploaded_videos(id,project_id,original_file_name,storage_path,mime_type,file_size_bytes,duration_seconds,width,height,has_audio,expires_at) VALUES($1,$2,'source.mp4','D:/private/source.mp4','video/mp4',1000,30,1920,1080,true,now()+interval '1 day')",
      [video, project],
    );
    await owner.pool.query(
      "INSERT INTO processing_jobs(id,project_id,user_id,type,status,step,credits_charged) VALUES($1,$2,'render-owner','analyze_video','completed','preview_ready',1)",
      [analysis, project],
    );
    await owner.pool.query("UPDATE projects SET current_job_id=$1 WHERE id=$2", [
      analysis,
      project,
    ]);
    await owner.pool.query(
      "INSERT INTO transcripts(id,project_id,processing_job_id,uploaded_video_id,language,model,duration_seconds,text) VALUES($1,$2,$3,$4,'en','fixture',30,'Saved caption')",
      [transcript, project, analysis, video],
    );
    await owner.pool.query(
      "INSERT INTO clip_candidates(id,project_id,processing_job_id,transcript_id,kind,rank,title,reason,start_time,end_time,score,caption_lines,caption_position,framing) VALUES($1,$2,$3,$4,'primary',0,'Saved clip','Fixture',1,5,0.9,$5,$6,NULL)",
      [
        clip,
        project,
        analysis,
        transcript,
        JSON.stringify([{ startTime: 1, endTime: 3, text: "Saved caption" }]),
        JSON.stringify({ x: 0.5, y: 0.72 }),
      ],
    );
  });
  it("replaces one slot with the best unused backup exactly once without charging", async () => {
    await owner.pool.query(
      "UPDATE projects SET current_job_id=$1,status='preview_ready' WHERE id=$2",
      [analysis, project],
    );
    await owner.pool.query(
      "INSERT INTO credit_ledger(user_id,type,amount,project_id,processing_job_id,description,idempotency_key) VALUES('render-owner','processing_deduction',-1,$1,$2,'Fixture analysis',$3)",
      [project, analysis, randomUUID()],
    );
    const backups = [randomUUID(), randomUUID()];
    for (let rank = 0; rank < 2; rank++)
      await owner.pool.query(
        "INSERT INTO clip_candidates(id,project_id,processing_job_id,transcript_id,kind,rank,title,reason,start_time,end_time,score,caption_lines,caption_position) SELECT $1,project_id,processing_job_id,transcript_id,'backup',$3,'Replacement','Fixture',start_time,end_time,score,caption_lines,caption_position FROM clip_candidates WHERE id=$2",
        [backups[rank], clip, rank],
      );
    await owner.pool.query(
      "UPDATE clip_candidates SET preview_font_size=72,caption_text_color='#123456',selected=false WHERE id=$1",
      [clip],
    );
    const revision = (
      await owner.pool.query<{ edit_revision: number }>(
        "SELECT edit_revision FROM clip_candidates WHERE id=$1",
        [clip],
      )
    ).rows[0].edit_revision;
    const key = randomUUID();
    const regenerate = async (id = clip, k = key, rev = revision) =>
      (
        await runtime.pool.query<{ result: unknown }>(
          "SELECT start_owned_clip_regeneration('render-owner',$1,$2,$3,$4) AS result",
          [project, id, rev, k],
        )
      ).rows[0].result;
    const [a, b] = await Promise.all([regenerate(), regenerate()]);
    expect(a).toEqual({ replacementClipId: backups[0], source: "backup_candidate" });
    expect(b).toEqual(a);
    expect(await regenerate()).toEqual(a);
    expect(await regenerate(clip, key, revision + 1)).toEqual({
      error: "CLIP_REGENERATION_IDEMPOTENCY_CONFLICT",
    });
    const replacement = (
      await owner.pool.query<{
        selected: boolean;
        rank: number;
        preview_font_size: number;
        caption_text_color: string;
        caption_edits: unknown[];
        replaces_clip_id: string;
        kind: string;
      }>(
        "SELECT selected,rank,preview_font_size,caption_text_color,caption_edits,replaces_clip_id,kind FROM clip_candidates WHERE id=$1",
        [backups[0]],
      )
    ).rows[0];
    expect(replacement).toMatchObject({
      selected: false,
      rank: 0,
      preview_font_size: 72,
      caption_text_color: "#123456",
      caption_edits: [],
      replaces_clip_id: clip,
      kind: "primary",
    });
    expect(
      (
        await owner.pool.query<{ count: string }>(
          "SELECT count(*) FROM credit_ledger WHERE processing_job_id=$1",
          [analysis],
        )
      ).rows[0].count,
    ).toBe("1");
    expect(
      (
        await owner.pool.query("SELECT kind,selected FROM clip_candidates WHERE id=$1", [
          backups[1],
        ])
      ).rows[0],
    ).toMatchObject({ kind: "backup", selected: false });
    // Return the original slot for the existing single-clip regression scenarios.
    await owner.pool.query("UPDATE clip_candidates SET deleted_at=now() WHERE id=$1", [backups[0]]);
    await owner.pool.query(
      "UPDATE clip_candidates SET deleted_at=NULL,selected=true,preview_font_size=48,caption_text_color='#FFFFFF' WHERE id=$1",
      [clip],
    );
  });
  it("queues a free replacement after backups exhaust and fences publication and edits", async () => {
    await owner.pool.query(
      "UPDATE clip_candidates SET deleted_at=now() WHERE project_id=$1 AND kind='backup'",
      [project],
    );
    const key = randomUUID();
    const request = async (k = key) =>
      (
        await runtime.pool.query<{ result: { jobId: string; source: string; status: string } }>(
          "SELECT start_owned_clip_regeneration('render-owner',$1,$2,0,$3) AS result",
          [project, clip, k],
        )
      ).rows[0].result;
    const first = await request();
    expect(first).toMatchObject({ source: "gemini_regeneration", status: "queued" });
    expect(await request()).toEqual(first);
    expect(
      (
        await owner.pool.query<{ credits_charged: number; refund_eligible: boolean }>(
          "SELECT credits_charged,refund_eligible FROM processing_jobs WHERE id=$1",
          [first.jobId],
        )
      ).rows[0],
    ).toMatchObject({ credits_charged: 0, refund_eligible: false });
    expect(
      (
        await owner.pool.query<{ count: string }>(
          "SELECT count(*) FROM credit_ledger WHERE processing_job_id=$1",
          [first.jobId],
        )
      ).rows[0].count,
    ).toBe("0");
    expect(
      (
        await runtime.pool.query<{ result: unknown }>(
          "SELECT get_owned_job_status('other-user',$1) AS result",
          [first.jobId],
        )
      ).rows[0].result,
    ).toBeNull();
    const edit = (
      await runtime.pool.query<{ result: { outcome: string } }>(
        "SELECT save_owned_clip_editor('render-owner',$1,$2,'{}') AS result",
        [project, clip],
      )
    ).rows[0].result;
    expect(edit).toEqual({ outcome: "CLIP_BUSY" });
    const token = randomUUID();
    const frozen = (
      await processing.pool.query<{ result: { sourceDurationSeconds: number } }>(
        "SELECT acquire_clip_regeneration($1,$2,$3) AS result",
        [first.jobId, project, token],
      )
    ).rows[0].result;
    expect(frozen.sourceDurationSeconds).toBe(30);
    const candidate = {
      title: "Fresh replacement",
      reason: "A different moment",
      score: 0.9,
      startTime: 10,
      endTime: 25,
      captionLines: [{ startTime: 10, endTime: 25, text: "Fresh caption" }],
    };
    expect(
      (
        await processing.pool.query<{ result: string | null }>(
          "SELECT complete_clip_regeneration($1,$2,$3) AS result",
          [first.jobId, randomUUID(), candidate],
        )
      ).rows[0].result,
    ).toBeNull();
    const replacement = (
      await processing.pool.query<{ result: string | null }>(
        "SELECT complete_clip_regeneration($1,$2,$3) AS result",
        [first.jobId, token, candidate],
      )
    ).rows[0].result;
    expect(replacement).toBeTruthy();
    expect(
      (
        await processing.pool.query<{ result: string | null }>(
          "SELECT complete_clip_regeneration($1,$2,$3) AS result",
          [first.jobId, token, candidate],
        )
      ).rows[0].result,
    ).toBe(replacement);
    expect(
      (
        await runtime.pool.query<{
          result: { status: string; replacementClipId?: string; clips: Array<{ status: string }> };
        }>("SELECT get_owned_job_status('render-owner',$1) AS result", [first.jobId])
      ).rows[0].result,
    ).toMatchObject({ status: "completed", replacementClipId: replacement });
    expect(
      (
        await owner.pool.query<{ processing_job_id: string; replaces_clip_id: string }>(
          "SELECT processing_job_id,replaces_clip_id FROM clip_candidates WHERE id=$1",
          [replacement],
        )
      ).rows[0],
    ).toMatchObject({ processing_job_id: analysis, replaces_clip_id: clip });
    await owner.pool.query("UPDATE clip_candidates SET deleted_at=now() WHERE id=$1", [
      replacement,
    ]);
    await owner.pool.query("UPDATE clip_candidates SET deleted_at=NULL,selected=true WHERE id=$1", [
      clip,
    ]);
    await owner.pool.query(
      "UPDATE projects SET current_job_id=$1,status='preview_ready' WHERE id=$2",
      [analysis, project],
    );
  });
  it("keeps the original candidate through exhausted regeneration attempts and permits a free retry", async () => {
    const request = async () =>
      (
        await runtime.pool.query<{ result: { jobId: string; status: string } }>(
          "SELECT start_owned_clip_regeneration('render-owner',$1,$2,0,$3) AS result",
          [project, clip, randomUUID()],
        )
      ).rows[0].result;
    const first = await request();
    expect(first.status).toBe("queued");
    for (let attempt = 1; attempt <= 2; attempt++) {
      const token = randomUUID();
      const acquired = await processing.pool.query<{ result: unknown }>(
        "SELECT acquire_clip_regeneration($1,$2,$3) AS result",
        [first.jobId, project, token],
      );
      expect(acquired.rows[0].result).not.toBeNull();
      expect(
        (
          await processing.pool.query<{ result: boolean }>(
            "SELECT fail_clip_regeneration($1,$2,true) AS result",
            [first.jobId, token],
          )
        ).rows[0].result,
      ).toBe(true);
      expect(
        (
          await owner.pool.query<{ deleted_at: Date | null }>(
            "SELECT deleted_at FROM clip_candidates WHERE id=$1",
            [clip],
          )
        ).rows[0].deleted_at,
      ).toBeNull();
      expect(
        (
          await owner.pool.query<{
            status: string;
            attempt_count: number;
            credits_charged: number;
          }>("SELECT status,attempt_count,credits_charged FROM processing_jobs WHERE id=$1", [
            first.jobId,
          ])
        ).rows[0],
      ).toMatchObject({
        status: attempt === 1 ? "queued" : "failed",
        attempt_count: attempt,
        credits_charged: 0,
      });
    }
    expect(
      (
        await owner.pool.query<{ count: string }>(
          "SELECT count(*) FROM credit_ledger WHERE processing_job_id=$1",
          [first.jobId],
        )
      ).rows[0].count,
    ).toBe("0");
    const retry = await request();
    expect(retry.status).toBe("queued");
    expect(retry.jobId).not.toBe(first.jobId);
    expect(
      (
        await processing.pool.query<{ result: boolean }>(
          "SELECT fail_clip_regeneration($1,NULL,false) AS result",
          [retry.jobId],
        )
      ).rows[0].result,
    ).toBe(true);
    await owner.pool.query(
      "UPDATE projects SET current_job_id=$1,status='preview_ready' WHERE id=$2",
      [analysis, project],
    );
  });
  afterAll(async () => {
    await Promise.all([runtime, processing, owner].map(closeDatabaseClient));
    const statement = await admin.pool.query<{ sql: string }>(
      "SELECT format('DROP DATABASE IF EXISTS %I WITH (FORCE)',$1::text) AS sql",
      [database],
    );
    await admin.pool.query(statement.rows[0]!.sql);
    await closeDatabaseClient(admin);
  });
  async function start(user = "render-owner", revision = 0, key = randomUUID()) {
    return (
      await runtime.pool.query<{ result: { jobId?: string; error?: string; status?: string } }>(
        "SELECT start_owned_clip_render($1,$2,$3,$4,$5) AS result",
        [user, project, clip, revision, key],
      )
    ).rows[0]!.result;
  }
  it("persists selection independently of edits and scopes changes to the owner", async () => {
    const select = async (user: string, selected: boolean) =>
      (
        await runtime.pool.query<{ result: unknown }>(
          "SELECT public.set_owned_clip_selection($1,$2,$3,$4) AS result",
          [user, project, clip, selected],
        )
      ).rows[0].result;
    expect(await select("other-user", false)).toEqual({ error: "CLIP_NOT_FOUND" });
    expect(await select("render-owner", false)).toMatchObject({ selected: false, revision: 0 });
    const list = (
      await runtime.pool.query<{ clips: { selected: boolean }[] }>(
        "SELECT clips FROM public.list_owned_project_clip_candidates($1,$2)",
        ["render-owner", project],
      )
    ).rows[0].clips;
    expect(list[0].selected).toBe(false);
    expect(await select("render-owner", true)).toMatchObject({ selected: true, revision: 0 });
    await expect(
      runtime.pool.query("UPDATE clip_candidates SET selected=false"),
    ).rejects.toMatchObject({ code: "42501" });
  });
  it("rejects foreign owners, stale revisions and direct writes", async () => {
    expect(await start("other-user")).toEqual({ error: "PROJECT_NOT_FOUND" });
    expect(await start(undefined, 2)).toEqual({ error: "CLIP_EDIT_CONFLICT" });
    for (const acquire of ["acquire_clip_batch_render", "acquire_clip_regeneration"]) {
      const denied = await processing.pool.query<{ result: unknown }>(
        `SELECT ${acquire}($1,$2,$3) AS result`,
        [analysis, project, randomUUID()],
      );
      expect(denied.rows[0].result).toBeNull();
    }
    expect(
      (
        await owner.pool.query<{ status: string }>(
          "SELECT status FROM processing_jobs WHERE id=$1",
          [analysis],
        )
      ).rows[0].status,
    ).toBe("completed");
    await expect(runtime.pool.query("SELECT * FROM render_requests")).rejects.toMatchObject({
      code: "42501",
    });
    await expect(
      processing.pool.query("UPDATE rendered_outputs SET title='stolen'"),
    ).rejects.toMatchObject({ code: "42501" });
  });
  it("soft-deletes a candidate while retaining history and allowing reuse of its live slot", async () => {
    const extra = randomUUID(),
      replacement = randomUUID();
    await owner.pool.query(
      "INSERT INTO clip_candidates(id,project_id,processing_job_id,transcript_id,kind,rank,title,reason,start_time,end_time,score,caption_lines,caption_position) SELECT $1,project_id,processing_job_id,transcript_id,kind,9,title,reason,start_time,end_time,score,caption_lines,caption_position FROM clip_candidates WHERE id=$2",
      [extra, clip],
    );
    const remove = async (user: string, revision: number) =>
      (
        await runtime.pool.query<{ result: unknown }>(
          "SELECT delete_owned_clip_candidate($1,$2,$3,$4) AS result",
          [user, project, extra, revision],
        )
      ).rows[0].result;
    expect(await remove("other-user", 0)).toEqual({ error: "CLIP_NOT_FOUND" });
    expect(await remove("render-owner", 1)).toEqual({ error: "CLIP_EDIT_CONFLICT" });
    expect(await remove("render-owner", 0)).toEqual({});
    expect(await remove("render-owner", 0)).toEqual({});
    const deleted = (
      await owner.pool.query<{ selected: boolean; deleted_at: Date | null }>(
        "SELECT selected,deleted_at FROM clip_candidates WHERE id=$1",
        [extra],
      )
    ).rows[0];
    expect(deleted.selected).toBe(false);
    expect(deleted.deleted_at).toBeInstanceOf(Date);
    await owner.pool.query(
      "INSERT INTO clip_candidates(id,project_id,processing_job_id,transcript_id,kind,rank,title,reason,start_time,end_time,score,caption_lines,caption_position,replaces_clip_id) SELECT $1,project_id,processing_job_id,transcript_id,kind,9,title,reason,start_time,end_time,score,caption_lines,caption_position,id FROM clip_candidates WHERE id=$2",
      [replacement, extra],
    );
    const list = (
      await runtime.pool.query<{ clips: { id: string }[] }>(
        "SELECT clips FROM list_owned_project_clip_candidates('render-owner',$1)",
        [project],
      )
    ).rows[0].clips;
    expect(list.map((item) => item.id)).toEqual([clip, replacement]);
    await owner.pool.query("DELETE FROM clip_candidates WHERE id=$1", [replacement]);
    await owner.pool.query("DELETE FROM clip_candidates WHERE id=$1", [extra]);
  });
  it("deduplicates concurrent requests and freezes saved data without charging", async () => {
    const key = randomUUID();
    const [a, b] = await Promise.all([start(undefined, 0, key), start(undefined, 0, key)]);
    expect(a).toEqual(b);
    renderJob = a.jobId!;
    expect(
      (
        await runtime.pool.query<{ result: unknown }>(
          "SELECT delete_owned_clip_candidate('render-owner',$1,$2,0) AS result",
          [project, clip],
        )
      ).rows[0].result,
    ).toEqual({ error: "CLIP_BUSY" });
    expect((await start(undefined, 0, aliasKey)).jobId).toBe(renderJob);
    expect((await start()).jobId).toBe(renderJob);
    const state = (
      await owner.pool.query<Record<string, unknown>>(
        "SELECT credits_charged,current_analysis_job_id,current_job_id FROM processing_jobs j JOIN projects p ON p.id=j.project_id WHERE j.id=$1",
        [renderJob],
      )
    ).rows[0];
    expect(state).toMatchObject({
      credits_charged: 0,
      current_analysis_job_id: analysis,
      current_job_id: renderJob,
    });
    expect(
      (
        await runtime.pool.query<{ editor: { clip: { id: string } } }>(
          "SELECT get_owned_clip_editor('render-owner',$1,$2) AS editor",
          [project, clip],
        )
      ).rows[0].editor.clip.id,
    ).toBe(clip);
    await owner.pool.query(
      "UPDATE clip_candidates SET title='Later edit',edit_revision=1 WHERE id=$1",
      [clip],
    );
    expect((await start(undefined, 1)).error).toBe("RENDER_ALREADY_RUNNING");
    const snap = (
      await owner.pool.query<{ snapshot: { clip: { title: string } } }>(
        "SELECT snapshot FROM render_requests WHERE job_id=$1",
        [renderJob],
      )
    ).rows[0].snapshot;
    expect(snap.clip.title).toBe("Saved clip");
    expect((await start(undefined, 1, key)).error).toBe("RENDER_IDEMPOTENCY_CONFLICT");
  });
  it("fences workers and persists exactly one output with independent expiration", async () => {
    const token = randomUUID();
    expect(
      (
        await processing.pool.query<{ result: { clip: { title: string } } }>(
          "SELECT acquire_clip_render($1,$2,$3) AS result",
          [renderJob, project, token],
        )
      ).rows[0].result.clip.title,
    ).toBe("Saved clip");
    expect(
      (
        await processing.pool.query<{ result: unknown }>(
          "SELECT acquire_clip_render($1,$2,$3) AS result",
          [renderJob, project, randomUUID()],
        )
      ).rows[0].result,
    ).toBeNull();
    const output = {
      storagePath: `D:/private/renders/${renderJob}/${token}.mp4`,
      fileName: "saved.mp4",
      fileSizeBytes: 1234,
      durationSeconds: 4,
    };
    const complete = async (t: string) =>
      (
        await processing.pool.query<{ id: string | null }>(
          "SELECT complete_clip_render($1,$2,$3,7) AS id",
          [renderJob, t, output],
        )
      ).rows[0].id;
    expect(await complete(randomUUID())).toBeNull();
    const id = await complete(token);
    expect(id).toBeTruthy();
    expect(await complete(token)).toBe(id);
    expect(await complete(randomUUID())).toBeNull();
    expect((await start(undefined, 0, aliasKey)).jobId).toBe(renderJob);
    expect(
      (
        await processing.pool.query<{ exists: boolean }>(
          "SELECT clip_render_output_exists($1,$2) AS exists",
          [renderJob, output.storagePath],
        )
      ).rows[0].exists,
    ).toBe(true);
    expect(
      (
        await processing.pool.query<{ exists: boolean }>(
          "SELECT clip_render_output_exists($1,$2) AS exists",
          [renderJob, `D:/private/${renderJob}/${randomUUID()}.mp4`],
        )
      ).rows[0].exists,
    ).toBe(false);
    expect(
      (
        await runtime.pool.query<{ result: unknown }>(
          "SELECT list_owned_render_outputs('other-user',$1) AS result",
          [project],
        )
      ).rows[0].result,
    ).toBeNull();
    expect(
      (
        await runtime.pool.query<{ result: unknown }>(
          "SELECT get_owned_render_output('other-user',$1,$2) AS result",
          [project, id],
        )
      ).rows[0].result,
    ).toBeNull();
    const outputs = (
      await runtime.pool.query<{ result: Array<{ createdAt: string; expiresAt: string }> }>(
        "SELECT list_owned_render_outputs('render-owner',$1) AS result",
        [project],
      )
    ).rows[0].result;
    expect(outputs).toHaveLength(1);
    expect(outputs[0]).not.toHaveProperty("storagePath");
    expect(Date.parse(outputs[0]!.expiresAt) - Date.parse(outputs[0]!.createdAt)).toBeGreaterThan(
      6.9 * 86400000,
    );
    const next = await start(undefined, 1);
    expect(next.jobId).not.toBe(renderJob);
    expect(
      (
        await runtime.pool.query("SELECT list_owned_project_clip_candidates('render-owner',$1)", [
          project,
        ])
      ).rows,
    ).toHaveLength(1);
    await processing.pool.query("SELECT fail_clip_render($1,NULL,false,'RENDER_FAILED')", [
      next.jobId,
    ]);
    expect(
      (
        await owner.pool.query<{ status: string }>("SELECT status FROM projects WHERE id=$1", [
          project,
        ])
      ).rows[0]!.status,
    ).toBe("preview_ready");
    expect(
      (
        await runtime.pool.query<{ result: unknown }>(
          "SELECT list_owned_render_outputs('render-owner',$1) AS result",
          [project],
        )
      ).rows[0].result,
    ).toHaveLength(1);
  });
  it("blocks pending tracking, rejects expired sources, and fences an expired retry lease", async () => {
    await owner.pool.query(
      "UPDATE uploaded_videos SET expires_at=now()-interval '1 second' WHERE id=$1",
      [video],
    );
    expect((await start(undefined, 1)).error).toBe("SOURCE_VIDEO_EXPIRED");
    await owner.pool.query(
      "UPDATE uploaded_videos SET expires_at=now()+interval '1 day' WHERE id=$1",
      [video],
    );
    await owner.pool.query("UPDATE clip_candidates SET framing=$1 WHERE id=$2", [
      JSON.stringify({
        mode: "follow",
        trackId: null,
        offset: { x: 0, y: 0 },
        manualCenter: { x: 0.5, y: 0.5 },
      }),
      clip,
    ]);
    await owner.pool.query(
      "INSERT INTO video_framing(uploaded_video_id,version,status) VALUES($1,'mediapipe-v1','queued')",
      [video],
    );
    expect((await start(undefined, 1)).error).toBe("RENDER_FRAMING_PENDING");
    await owner.pool.query("UPDATE video_framing SET status='failed' WHERE uploaded_video_id=$1", [
      video,
    ]);
    const key = randomUUID(),
      started = await start(undefined, 1, key),
      job = started.jobId!;
    const first = randomUUID(),
      second = randomUUID();
    const acquired = await processing.pool.query<{ result: { tracks: unknown } }>(
      "SELECT acquire_clip_render($1,$2,$3) AS result",
      [job, project, first],
    );
    expect(acquired.rows[0]!.result.tracks).toBeNull();
    await owner.pool.query(
      "UPDATE processing_jobs SET execution_lease_expires_at=now()-interval '1 second' WHERE id=$1",
      [job],
    );
    expect(
      (
        await processing.pool.query<{ valid: boolean }>(
          "SELECT touch_clip_render($1,$2,'rendering',50) AS valid",
          [job, first],
        )
      ).rows[0]!.valid,
    ).toBe(false);
    await processing.pool.query("SELECT acquire_clip_render($1,$2,$3)", [job, project, second]);
    expect(
      (
        await processing.pool.query<{ valid: boolean }>(
          "SELECT fail_clip_render($1,$2,false,'RENDER_FAILED') AS valid",
          [job, first],
        )
      ).rows[0]!.valid,
    ).toBe(false);
    await processing.pool.query("SELECT fail_clip_render($1,$2,true,'RENDER_FAILED')", [
      job,
      second,
    ]);
    expect(await start(undefined, 1, key)).toMatchObject({ jobId: job, status: "failed" });
    expect(
      (
        await owner.pool.query<{ status: string; attempt_count: number }>(
          "SELECT status,attempt_count FROM processing_jobs WHERE id=$1",
          [job],
        )
      ).rows[0],
    ).toMatchObject({ status: "failed", attempt_count: 2 });
    await owner.pool.query("UPDATE clip_candidates SET framing=NULL WHERE id=$1", [clip]);
  });
  it("rejects batches atomically and retains partial outputs across lease takeover and retry limits", async () => {
    const extra = randomUUID();
    await owner.pool.query(
      "INSERT INTO clip_candidates(id,project_id,processing_job_id,transcript_id,kind,rank,title,reason,start_time,end_time,score,caption_lines,caption_position) SELECT $1,project_id,processing_job_id,transcript_id,'primary',2,'Batch second clip',reason,start_time,end_time,score,caption_lines,caption_position FROM clip_candidates WHERE id=$2",
      [extra, clip],
    );
    const request = async (revisions: Record<string, number>, key = randomUUID()) =>
      (
        await runtime.pool.query<{
          result: { jobId?: string; error?: string; outputCount?: number };
        }>("SELECT start_owned_clip_batch_render('render-owner',$1,$2,$3) AS result", [
          project,
          revisions,
          key,
        ])
      ).rows[0].result;
    const countBefore = (
      await owner.pool.query<{ count: string }>(
        "SELECT count(*) FROM processing_jobs WHERE project_id=$1",
        [project],
      )
    ).rows[0].count;
    expect(await request({ [clip]: 1, [extra]: 99 })).toEqual({ error: "CLIP_EDIT_CONFLICT" });
    expect(await request({ [clip]: 1, [randomUUID()]: 0 })).toEqual({
      error: "RENDER_CLIP_NOT_FOUND",
    });
    await runtime.pool.query("SELECT set_owned_clip_selection('render-owner',$1,$2,false)", [
      project,
      extra,
    ]);
    expect(await request({ [clip]: 1, [extra]: 0 })).toEqual({ error: "RENDER_CLIP_NOT_SELECTED" });
    expect(
      (
        await owner.pool.query<{ count: string }>(
          "SELECT count(*) FROM processing_jobs WHERE project_id=$1",
          [project],
        )
      ).rows[0].count,
    ).toBe(countBefore);
    await runtime.pool.query("SELECT set_owned_clip_selection('render-owner',$1,$2,true)", [
      project,
      extra,
    ]);
    const key = randomUUID();
    const accepted = await request({ [clip]: 1, [extra]: 0 }, key);
    expect(accepted.outputCount).toBe(2);
    expect(await request({ [clip]: 1, [extra]: 0 }, key)).toEqual(accepted);
    await expect(
      owner.pool.query("UPDATE render_request_items SET revision=99 WHERE job_id=$1", [
        accepted.jobId,
      ]),
    ).rejects.toMatchObject({ code: "55000" });
    const first = randomUUID();
    await processing.pool.query("SELECT acquire_clip_batch_render($1,$2,$3)", [
      accepted.jobId,
      project,
      first,
    ]);
    const begin = async (token: string) =>
      (
        await processing.pool.query<{ result: RenderSnapshot }>(
          "SELECT begin_clip_render_item($1,$2) AS result",
          [accepted.jobId, token],
        )
      ).rows[0].result;
    const snapshot = await begin(first);
    const completedClip = snapshot.clip.id;
    await owner.pool.query("UPDATE clip_candidates SET title='Future edit' WHERE id=$1", [
      completedClip,
    ]);
    expect(
      (
        await owner.pool.query<{ snapshot: RenderSnapshot }>(
          "SELECT snapshot FROM render_request_items WHERE job_id=$1 AND clip_id=$2",
          [accepted.jobId, completedClip],
        )
      ).rows[0].snapshot.clip.title,
    ).toBe(snapshot.clip.title);
    const output = {
      storagePath: `D:/private/renders/${accepted.jobId}/${completedClip}/${first}.mp4`,
      fileName: "batch.mp4",
      fileSizeBytes: 1234,
      durationSeconds: 4,
    };
    const invalidPublications = [
      { token: first, candidate: { ...output, durationSeconds: "NaN" } },
      {
        token: first,
        candidate: {
          fileName: output.fileName,
          fileSizeBytes: output.fileSizeBytes,
          durationSeconds: output.durationSeconds,
        },
      },
      { token: first, candidate: { ...output, durationSeconds: 999 } },
      { token: first, candidate: { ...output, fileSizeBytes: 0 } },
      { token: null, candidate: output },
    ];
    for (const invalid of invalidPublications) {
      expect(
        (
          await processing.pool.query<{ result: string | null }>(
            "SELECT complete_clip_render_item($1,$2,$3,$4,7) AS result",
            [accepted.jobId, invalid.token, completedClip, invalid.candidate],
          )
        ).rows[0].result,
      ).toBeNull();
    }
    expect(
      (
        await owner.pool.query<{ count: string }>(
          "SELECT count(*) FROM rendered_outputs WHERE render_job_id=$1",
          [accepted.jobId],
        )
      ).rows[0].count,
    ).toBe("0");
    const id = (
      await processing.pool.query<{ result: string | null }>(
        "SELECT complete_clip_render_item($1,$2,$3,$4,7) AS result",
        [accepted.jobId, first, completedClip, output],
      )
    ).rows[0].result;
    expect(id).toBeTruthy();
    expect(
      (
        await processing.pool.query<{ result: string | null }>(
          "SELECT complete_clip_render_item($1,$2,$3,$4,7) AS result",
          [accepted.jobId, first, completedClip, output],
        )
      ).rows[0].result,
    ).toBe(id);
    const partial = (
      await runtime.pool.query<{
        result: { status: string; replacementClipId?: string; clips: Array<{ status: string }> };
      }>("SELECT get_owned_job_status('render-owner',$1) AS result", [accepted.jobId])
    ).rows[0].result;
    expect(partial.status).toBe("active");
    expect(
      partial.clips.filter((item: { status: string }) => item.status === "completed"),
    ).toHaveLength(1);
    const remaining = (await begin(first)).clip.id;
    await owner.pool.query(
      "UPDATE processing_jobs SET execution_lease_expires_at=now()-interval '1 second' WHERE id=$1",
      [accepted.jobId],
    );
    const second = randomUUID();
    await processing.pool.query("SELECT acquire_clip_batch_render($1,$2,$3)", [
      accepted.jobId,
      project,
      second,
    ]);
    expect((await begin(second)).clip.id).toBe(remaining);
    expect(
      (
        await processing.pool.query<{ result: boolean }>(
          "SELECT fail_clip_render_item($1,$2,$3,false,'RENDER_FAILED') AS result",
          [accepted.jobId, first, remaining],
        )
      ).rows[0].result,
    ).toBe(false);
    await processing.pool.query("SELECT fail_clip_render_item($1,$2,$3,true,'RENDER_FAILED')", [
      accepted.jobId,
      second,
      remaining,
    ]);
    const terminal = (
      await runtime.pool.query<{
        result: { status: string; replacementClipId?: string; clips: Array<{ status: string }> };
      }>("SELECT get_owned_job_status('render-owner',$1) AS result", [accepted.jobId])
    ).rows[0].result;
    expect(terminal.status).toBe("failed");
    expect(terminal.clips.map((item: { status: string }) => item.status).sort()).toEqual([
      "completed",
      "failed",
    ]);
    expect(
      (
        await owner.pool.query<{ status: string }>("SELECT status FROM projects WHERE id=$1", [
          project,
        ])
      ).rows[0].status,
    ).toBe("preview_ready");
    expect(
      (
        await owner.pool.query<{ count: string }>(
          "SELECT count(*) FROM rendered_outputs WHERE render_job_id=$1",
          [accepted.jobId],
        )
      ).rows[0].count,
    ).toBe("1");
    expect(
      (
        await owner.pool.query<{ attempt_count: number }>(
          "SELECT attempt_count FROM render_item_progress WHERE job_id=$1 AND clip_id=$2",
          [accepted.jobId, remaining],
        )
      ).rows[0].attempt_count,
    ).toBe(2);
    const fresh = await request({ [remaining]: remaining === clip ? 1 : 0 });
    expect(fresh.jobId).not.toBe(accepted.jobId);
    await processing.pool.query("SELECT fail_clip_render($1,NULL,false,'RENDER_FAILED')", [
      fresh.jobId,
    ]);
    await owner.pool.query("UPDATE clip_candidates SET title='Later edit' WHERE id=$1", [clip]);
    await owner.pool.query("UPDATE clip_candidates SET deleted_at=now() WHERE id=$1", [extra]);
  });
  it("recovers a queue outage and transient failure, then publishes a real two-clip MP4 batch", async () => {
    await mkdir(resolve("storage"), { recursive: true });
    const root = await mkdtemp(resolve("storage/vs6-integration-"));
    const source = join(root, "source.mp4");
    const prefix = `vs6-${randomUUID()}`;
    vi.stubEnv("BULLMQ_PREFIX", prefix);
    const redisUrl = process.env.TEST_REDIS_URL ?? "redis://localhost:6379";
    const connection = new Redis(redisUrl, { maxRetriesPerRequest: 1 });
    const makeConnections = (url: string) =>
      new BullMqConnectionFactory({
        redisUrl: url,
        random: () => 0,
        createClient: (target, options) => new Redis(target, options),
      });
    const offlineConnections = makeConnections("redis://127.0.0.1:1");
    const connections = makeConnections(redisUrl);
    const scoped = { database: processing } as unknown as ScopedDatabaseService;
    const offline = new RenderDispatcherService(scoped, offlineConnections);
    const dispatcher = new RenderDispatcherService(scoped, connections);
    const workerConfig = {
      ...loadWorkerConfig({
        ...process.env,
        NODE_ENV: "test",
        FFMPEG_PATH: "ffmpeg",
        WHISPER_PYTHON_PATH: "python",
      }),
      bullmqPrefix: prefix,
      redisUrl,
      storageRoot: root,
      ffmpegPath: "vs6-test-missing-ffmpeg",
      render: {
        preset: "veryfast",
        crf: 20,
        timeoutMs: 120000,
        fontPath: resolve("packages/shared/assets/fonts/Inter-Black.ttf"),
        ffprobePath: "ffprobe",
        retentionDays: 7,
      },
    };
    const worker = new RenderWorkerService(
      client(runtimeUrl, "repurposepro_processing", database),
      workerConfig,
    );
    try {
      await runMedia(
        "ffmpeg",
        [
          "-hide_banner",
          "-y",
          "-f",
          "lavfi",
          "-i",
          "testsrc2=size=640x360:rate=30:duration=6",
          "-f",
          "lavfi",
          "-i",
          "sine=duration=6",
          "-c:v",
          "libx264",
          "-preset",
          "ultrafast",
          "-c:a",
          "aac",
          "-shortest",
          source,
        ],
        { timeoutMs: 30000 },
      );
      await owner.pool.query(
        "UPDATE uploaded_videos SET storage_path=$1,file_size_bytes=$2,width=640,height=360 WHERE id=$3",
        [source, (await stat(source)).size, video],
      );
      const secondClip = randomUUID();
      await owner.pool.query(
        "INSERT INTO clip_candidates(id,project_id,processing_job_id,transcript_id,kind,rank,title,reason,start_time,end_time,score,caption_lines,caption_position) SELECT $1,project_id,processing_job_id,transcript_id,'primary',1,'Second real export',reason,start_time,end_time,score,caption_lines,caption_position FROM clip_candidates WHERE id=$2",
        [secondClip, clip],
      );
      const started = (
        await runtime.pool.query<{ result: { jobId: string } }>(
          "SELECT start_owned_clip_batch_render('render-owner',$1,$2,$3) AS result",
          [project, { [clip]: 1, [secondClip]: 0 }, randomUUID()],
        )
      ).rows[0].result;
      const jobId = started.jobId;
      await offline.dispatch();
      expect(
        (
          await owner.pool.query<{ status: string }>(
            "SELECT status FROM processing_jobs WHERE id=$1",
            [jobId],
          )
        ).rows[0]!.status,
      ).toBe("queued");
      await owner.pool.query(
        "UPDATE processing_job_dispatches SET next_attempt_at=now() WHERE processing_job_id=$1",
        [jobId],
      );
      await worker.onModuleInit();
      await connections.createProducer().connect();
      await dispatcher.dispatch();
      await vi.waitFor(
        async () => {
          expect(
            (
              await owner.pool.query<Record<string, unknown>>(
                "SELECT status,attempt_count FROM processing_jobs WHERE id=$1",
                [jobId],
              )
            ).rows[0],
          ).toMatchObject({ status: "queued", attempt_count: 1 });
        },
        { timeout: 10000, interval: 100 },
      );
      workerConfig.ffmpegPath = "ffmpeg";
      await vi.waitFor(
        async () => {
          expect(
            (
              await owner.pool.query<Record<string, unknown>>(
                "SELECT status,progress FROM processing_jobs WHERE id=$1",
                [jobId],
              )
            ).rows[0],
          ).toMatchObject({ status: "completed", progress: 100 });
        },
        { timeout: 30000, interval: 150 },
      );
      const output = (
        await owner.pool.query<{
          storage_path: string;
          file_size_bytes: string;
          width: number;
          height: number;
        }>(
          "SELECT storage_path,file_size_bytes,width,height FROM rendered_outputs WHERE render_job_id=$1",
          [jobId],
        )
      ).rows[0]!;
      expect(output).toMatchObject({ width: 1080, height: 1920 });
      expect(
        (
          await owner.pool.query<{ attempt_count: number }>(
            "SELECT attempt_count FROM processing_jobs WHERE id=$1",
            [jobId],
          )
        ).rows[0]!.attempt_count,
      ).toBe(2);
      expect((await stat(output.storage_path)).size).toBe(Number(output.file_size_bytes));
      expect(
        (
          await owner.pool.query<{ count: string }>(
            "SELECT count(*) FROM rendered_outputs WHERE render_job_id=$1",
            [jobId],
          )
        ).rows[0].count,
      ).toBe("2");
    } finally {
      await worker.onModuleDestroy();
      await Promise.all([offline.onModuleDestroy(), dispatcher.onModuleDestroy()]);
      await Promise.all([offlineConnections.onModuleDestroy(), connections.onModuleDestroy()]);
      let cursor = "0";
      do {
        const [next, keys] = await connection.scan(cursor, "MATCH", `${prefix}:*`, "COUNT", 100);
        cursor = next;
        if (keys.length) await connection.del(...keys);
      } while (cursor !== "0");
      await connection.quit();
      await rm(root, { recursive: true, force: true });
      vi.unstubAllEnvs();
    }
  }, 60000);
});
