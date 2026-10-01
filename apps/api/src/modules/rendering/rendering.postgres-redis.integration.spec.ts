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
    await expect(runtime.pool.query("SELECT * FROM render_requests")).rejects.toMatchObject({
      code: "42501",
    });
    await expect(
      processing.pool.query("UPDATE rendered_outputs SET title='stolen'"),
    ).rejects.toMatchObject({ code: "42501" });
  });
  it("deduplicates concurrent requests and freezes saved data without charging", async () => {
    const key = randomUUID();
    const [a, b] = await Promise.all([start(undefined, 0, key), start(undefined, 0, key)]);
    expect(a).toEqual(b);
    renderJob = a.jobId!;
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
  it("recovers a queue outage and transient failure, then publishes one real MP4", async () => {
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
      const started = await start(undefined, 1);
      const jobId = started.jobId!;
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
      ).toBe("1");
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
