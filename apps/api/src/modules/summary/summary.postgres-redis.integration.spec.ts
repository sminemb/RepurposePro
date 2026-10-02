import { randomUUID } from "node:crypto";
import { resolve, join } from "node:path";
import { mkdir, mkdtemp, rm, stat, readFile } from "node:fs/promises";
import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import {
  createDatabaseClient,
  closeDatabaseClient,
  migrateDatabaseForTests,
} from "@repurposepro/db";
import { loadWorkerConfig } from "@repurposepro/config";
import { summaryStateSchema } from "@repurposepro/shared";
import { SummaryRenderer } from "../../../../worker/src/services/summary-renderer.service";
import { runMedia, probeMedia } from "../../../../worker/src/services/render-ffmpeg";
import Redis from "ioredis";
import { RenderWorkerService } from "../../../../worker/src/services/render-worker.service";
import { RenderDispatcherService } from "../rendering/render-dispatcher.service";
import { RenderingService } from "../rendering/rendering.service";
import { BullMqConnectionFactory } from "../infrastructure/bullmq-connection.factory";
import type { ScopedDatabaseService, DatabaseService } from "../infrastructure/database.service";
const bootstrap = process.env.TEST_DATABASE_BOOTSTRAP_URL,
  migration = process.env.TEST_DATABASE_MIGRATION_URL,
  runtimeUrl = process.env.TEST_DATABASE_RUNTIME_URL;
const suite = bootstrap && migration && runtimeUrl ? describe : describe.skip;
const database = `repurposepro_summary_${randomUUID().replaceAll("-", "")}`;
function client(url: string | undefined, role?: string, name?: string) {
  const target = new URL(url ?? "postgresql://localhost/postgres");
  if (role) target.username = role;
  if (name) target.pathname = `/${name}`;
  return createDatabaseClient({ connectionString: target.toString(), poolMax: 3, ssl: false });
}
suite("summary lifecycle", () => {
  const admin = client(bootstrap),
    owner = client(migration, undefined, database),
    runtime = client(runtimeUrl, undefined, database),
    processing = client(runtimeUrl, "repurposepro_processing", database);
  const project = randomUUID(),
    video = randomUUID(),
    analysis = randomUUID(),
    token = randomUUID();
  let directory: string, source: string;
  beforeAll(async () => {
    const statement = await admin.pool.query<{ sql: string }>(
      "SELECT format('CREATE DATABASE %I OWNER repurposepro_owner',$1::text) AS sql",
      [database],
    );
    await admin.pool.query(statement.rows[0]!.sql);
    await migrateDatabaseForTests(owner, resolve("packages/db/drizzle"));
    const password = decodeURIComponent(new URL(runtimeUrl!).password);
    const role = await admin.pool.query<{ sql: string }>(
      "SELECT format('ALTER ROLE repurposepro_processing PASSWORD %L',$1::text) AS sql",
      [password],
    );
    await admin.pool.query(role.rows[0]!.sql);
    await mkdir(resolve("storage/vs8-verification"), { recursive: true });
    directory = await mkdtemp(resolve("storage/vs8-verification/integration-"));
    source = join(directory, "source.mp4");
    await runMedia(
      "ffmpeg",
      [
        "-hide_banner",
        "-y",
        "-f",
        "lavfi",
        "-i",
        "testsrc2=size=640x360:rate=30:duration=20",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=440:duration=5",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=880:duration=15",
        "-filter_complex",
        "[1:a][2:a]concat=n=2:v=0:a=1[a]",
        "-map",
        "0:v",
        "-map",
        "[a]",
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
      "INSERT INTO users(id,name,email) VALUES('summary-owner','Summary','summary@example.test')",
    );
    await owner.pool.query(
      "INSERT INTO projects(id,user_id,name,output_type,status) VALUES($1,'summary-owner','Summary','summary','analyzing')",
      [project],
    );
    await owner.pool.query(
      "INSERT INTO uploaded_videos(id,project_id,original_file_name,storage_path,mime_type,file_size_bytes,duration_seconds,width,height,has_audio,expires_at) VALUES($1,$2,'source.mp4',$3,'video/mp4',$4,20,640,360,true,now()+interval '1 day')",
      [video, project, source, (await stat(source)).size],
    );
    await owner.pool.query(
      "INSERT INTO processing_jobs(id,project_id,user_id,type,status,step,credits_charged,execution_lease_token,execution_lease_owner,execution_lease_expires_at,execution_heartbeat_at) VALUES($1,$2,'summary-owner','analyze_video','active','analyzing',1,$3,'summary-test',now()+interval '1 hour',now())",
      [analysis, project, token],
    );
    await owner.pool.query("UPDATE projects SET current_job_id=$1 WHERE id=$2", [
      analysis,
      project,
    ]);
    await owner.pool.query(
      "INSERT INTO transcripts(project_id,processing_job_id,uploaded_video_id,language,model,duration_seconds,text) VALUES($1,$2,$3,'en','fixture',20,'Important chronological ideas')",
      [project, analysis, video],
    );
  }, 60000);
  afterAll(async () => {
    await Promise.all([runtime, processing, owner].map(closeDatabaseClient));
    const statement = await admin.pool.query<{ sql: string }>(
      "SELECT format('DROP DATABASE IF EXISTS %I WITH (FORCE)',$1::text) AS sql",
      [database],
    );
    await admin.pool.query(statement.rows[0]!.sql);
    await closeDatabaseClient(admin);
    if (directory) await rm(directory, { recursive: true, force: true });
  });
  const finalize = (ranges: unknown, t = token) =>
    processing.pool
      .query<{ result: string }>(
        "SELECT public.finalize_summary_preview($1,'summary-test',$2,$3) AS result",
        [analysis, t, JSON.stringify(ranges)],
      )
      .then((r) => r.rows[0]!.result);
  const get = (user = "summary-owner") =>
    runtime.pool
      .query<{ result: unknown }>("SELECT public.get_owned_summary($1,$2) AS result", [
        user,
        project,
      ])
      .then((r) => r.rows[0]!.result);
  const save = (revision: number, segments: unknown) =>
    runtime.pool
      .query<{ result: unknown }>(
        "SELECT public.save_owned_summary('summary-owner',$1,$2,$3) AS result",
        [project, revision, JSON.stringify(segments)],
      )
      .then((r) => r.rows[0]!.result);
  const start = (revision: number, key = randomUUID()) =>
    runtime.pool
      .query<{ result: { jobId: string; error?: string } }>(
        "SELECT public.start_owned_summary_render('summary-owner',$1,$2,$3) AS result",
        [project, revision, key],
      )
      .then((r) => r.rows[0]!.result);
  it("uses trusted project mode, rejects bad ranges and fences finalization", async () => {
    expect(
      (
        await processing.pool.query<{ result: string }>(
          "SELECT public.analysis_output_type($1,'summary-test',$2) AS result",
          [analysis, token],
        )
      ).rows[0]!.result,
    ).toBe("summary");
    expect(await finalize([{ startTime: 0, endTime: 5, reason: "Too long" }])).toBe("rejected");
    expect(
      await finalize([
        { startTime: 0, endTime: 1, reason: "First" },
        { startTime: 0.5, endTime: 1.5, reason: "Overlap" },
      ]),
    ).toBe("rejected");
    expect(await finalize([{ startTime: 1, endTime: 2, reason: "First" }], randomUUID())).toBe(
      "lost",
    );
    const ranges = [
      { startTime: 1, endTime: 2, reason: "Context" },
      { startTime: 10, endTime: 11, reason: "Idea" },
    ];
    expect(await finalize(ranges)).toBe("created");
    expect(await finalize(ranges)).toBe("existing");
    const state = summaryStateSchema.parse(await get());
    expect(state.targetDurationSeconds).toBe(2);
    expect(state.segments).toHaveLength(2);
  });
  it("denies cross-user access and direct runtime/worker writes", async () => {
    expect(await get("another-user")).toBeNull();
    await expect(runtime.pool.query("UPDATE summary_segments SET selected=false")).rejects.toThrow(
      /permission denied/,
    );
    await expect(processing.pool.query("UPDATE summaries SET edit_revision=10")).rejects.toThrow(
      /permission denied/,
    );
  });
  it("saves atomically, prevents overlap, and detects competing edits", async () => {
    const state = summaryStateSchema.parse(await get());
    const edits = state.segments.map(({ id, startTime, endTime, selected }) => ({
      id,
      startTime,
      endTime,
      selected,
    }));
    expect(await save(0, [{ ...edits[0], endTime: 12 }, edits[1]])).toEqual({
      error: "SUMMARY_INVALID_RANGES",
    });
    expect(await save(0, [edits[0], edits[0]])).toEqual({ error: "VALIDATION_ERROR" });
    const results = await Promise.all([save(0, edits), save(0, edits)]);
    expect(results.filter((x) => typeof x === "object" && x !== null && "error" in x)).toHaveLength(
      1,
    );
    expect(summaryStateSchema.parse(await get()).revision).toBe(1);
  });
  it("removes and restores, permitting manual duration beyond the target", async () => {
    const state = summaryStateSchema.parse(await get());
    const edits = state.segments.map(({ id, startTime, endTime, selected }) => ({
      id,
      startTime,
      endTime,
      selected,
    }));
    const removed = summaryStateSchema.parse(
      await save(1, [
        { ...edits[0], endTime: 12 },
        { ...edits[1], selected: false },
      ]),
    );
    expect(removed.currentDurationSeconds).toBe(11);
    expect(await save(2, [{ ...edits[0], endTime: 12 }, edits[1]])).toEqual({
      error: "SUMMARY_INVALID_RANGES",
    });
    const restored = summaryStateSchema.parse(await save(2, edits));
    expect(restored.currentDurationSeconds).toBe(2);
  });
  it("freezes revisions, binds keys, and rejects stale or empty renders", async () => {
    expect(await start(2)).toEqual({ error: "SUMMARY_EDIT_CONFLICT" });
    const state = summaryStateSchema.parse(await get()),
      edits = state.segments.map(({ id, startTime, endTime, selected }) => ({
        id,
        startTime,
        endTime,
        selected,
      }));
    const key = randomUUID(),
      job = await start(3, key);
    expect(job.jobId).toBeDefined();
    expect(await start(3, key)).toEqual(job);
    expect(await start(4, key)).toEqual({ error: "RENDER_IDEMPOTENCY_CONFLICT" });
    await save(3, [{ ...edits[0], endTime: 3 }, edits[1]]);
    const snapshot = (
      await owner.pool.query<{ snapshot: { segments: Array<{ endTime: number }> } }>(
        "SELECT snapshot FROM summary_render_requests WHERE job_id=$1",
        [job.jobId],
      )
    ).rows[0]!.snapshot;
    expect(snapshot.segments[0]!.endTime).toBe(2);
    await expect(
      owner.pool.query("UPDATE summary_render_requests SET revision=9 WHERE job_id=$1", [
        job.jobId,
      ]),
    ).rejects.toThrow(/immutable/);
    await new SummaryRenderer(processing, {
      ...loadWorkerConfig(),
      storageRoot: resolve("storage"),
      ffmpegPath: "ffmpeg",
      render: { ...loadWorkerConfig().render, ffprobePath: "ffprobe", preset: "ultrafast" },
    }).process(job.jobId, project);
    const outputs = (
      await runtime.pool.query<{
        result: Array<{
          type: string;
          clipId: null;
          width: number;
          height: number;
          durationSeconds: number;
        }>;
      }>("SELECT public.list_owned_render_outputs('summary-owner',$1) AS result", [project])
    ).rows[0]!.result;
    expect(outputs).toHaveLength(1);
    expect(outputs[0]).toMatchObject({ type: "summary", clipId: null, width: 640, height: 360 });
    expect(outputs[0]!.durationSeconds).toBeCloseTo(2, 1);
    await new SummaryRenderer(processing, loadWorkerConfig()).process(job.jobId, project);
    expect(
      (
        await owner.pool.query<{ count: string }>(
          "SELECT count(*) FROM rendered_outputs WHERE render_job_id=$1",
          [job.jobId],
        )
      ).rows[0]!.count,
    ).toBe("1");
    const output = (
      await owner.pool.query<{ storage_path: string }>(
        "SELECT storage_path FROM rendered_outputs WHERE render_job_id=$1",
        [job.jobId],
      )
    ).rows[0]!;
    const media = await probeMedia("ffprobe", output.storage_path);
    expect(media.streams.find((s) => s.codec_type === "audio")?.codec_name).toBe("aac");
    const pcmPath = join(directory, "summary-audio.pcm");
    await runMedia(
      "ffmpeg",
      ["-y", "-i", output.storage_path, "-vn", "-ac", "1", "-ar", "48000", "-f", "s16le", pcmPath],
      { timeoutMs: 30000 },
    );
    const pcm = await readFile(pcmPath);
    const crossings = (from: number, to: number) => {
      let count = 0;
      for (let sample = Math.floor(from * 48000) + 1; sample < Math.floor(to * 48000); sample++)
        if (pcm.readInt16LE((sample - 1) * 2) < 0 !== pcm.readInt16LE(sample * 2) < 0) count++;
      return count;
    };
    // Original 440Hz context precedes the original 880Hz conclusion across the join.
    expect(crossings(0.2, 0.8)).toBeGreaterThan(500);
    expect(crossings(1.2, 1.8) / crossings(0.2, 0.8)).toBeCloseTo(2, 1);
    expect(
      (
        await owner.pool.query<{ credits_charged: number; refund_eligible: boolean }>(
          "SELECT credits_charged,refund_eligible FROM processing_jobs WHERE id=$1",
          [job.jobId],
        )
      ).rows[0],
    ).toEqual({ credits_charged: 0, refund_eligible: false });
  }, 60000);
  it("caps persisted attempts and retains edits after render failure", async () => {
    const job = await start(4),
      a = randomUUID();
    await processing.pool.query("SELECT public.acquire_summary_render($1,$2,$3)", [
      job.jobId,
      project,
      a,
    ]);
    await processing.pool.query("SELECT public.fail_summary_render($1,$2,true)", [job.jobId, a]);
    const b = randomUUID();
    await processing.pool.query("SELECT public.acquire_summary_render($1,$2,$3)", [
      job.jobId,
      project,
      b,
    ]);
    await processing.pool.query("SELECT public.fail_summary_render($1,$2,true)", [job.jobId, b]);
    const record = (
      await owner.pool.query<{ status: string; attempt_count: number }>(
        "SELECT status,attempt_count FROM processing_jobs WHERE id=$1",
        [job.jobId],
      )
    ).rows[0];
    expect(record).toEqual({ status: "failed", attempt_count: 2 });
    expect(summaryStateSchema.parse(await get()).revision).toBe(4);
  });
  it("rejects empty selections and expired sources without creating a render", async () => {
    const state = summaryStateSchema.parse(await get());
    const edits = state.segments.map(({ id, startTime, endTime }) => ({
      id,
      startTime,
      endTime,
      selected: false,
    }));
    const empty = summaryStateSchema.parse(await save(state.revision, edits));
    expect(await start(empty.revision)).toEqual({ error: "SUMMARY_EMPTY_SELECTION" });
    const restored = summaryStateSchema.parse(
      await save(
        empty.revision,
        edits.map((s) => ({ ...s, selected: true })),
      ),
    );
    await owner.pool.query(
      "UPDATE uploaded_videos SET expires_at=now()-interval '1 second' WHERE id=$1",
      [video],
    );
    expect(await start(restored.revision)).toEqual({ error: "SOURCE_VIDEO_EXPIRED" });
    await owner.pool.query(
      "UPDATE uploaded_videos SET expires_at=now()+interval '1 day' WHERE id=$1",
      [video],
    );
  });
  it("fences duplicate execution, lease takeover and malformed publication", async () => {
    const job = await start(summaryStateSchema.parse(await get()).revision),
      a = randomUUID(),
      b = randomUUID();
    const acquire = (t: string) =>
      processing.pool
        .query<{ result: unknown }>("SELECT public.acquire_summary_render($1,$2,$3) AS result", [
          job.jobId,
          project,
          t,
        ])
        .then((r) => r.rows[0]!.result);
    expect(await acquire(a)).toBeTruthy();
    expect(await acquire(b)).toBeNull();
    await owner.pool.query(
      "UPDATE processing_jobs SET execution_lease_expires_at=now()-interval '1 second' WHERE id=$1",
      [job.jobId],
    );
    expect(await acquire(b)).toBeTruthy();
    expect(
      (
        await processing.pool.query<{ result: boolean }>(
          "SELECT public.touch_summary_render($1,$2,'rendering',50) AS result",
          [job.jobId, a],
        )
      ).rows[0]!.result,
    ).toBe(false);
    const badOutput = {
      storagePath: source,
      fileName: "summary.mp4",
      fileSizeBytes: 1,
      durationSeconds: 3,
      width: 640,
      height: 360,
      videoCodec: "h264",
      audioCodec: "aac",
    };
    for (const output of [
      { ...badOutput, videoCodec: "vp9" },
      { ...badOutput, width: 641 },
      { ...badOutput, durationSeconds: 20 },
      { ...badOutput, fileSizeBytes: 0 },
    ]) {
      expect(
        (
          await processing.pool.query<{ result: unknown }>(
            "SELECT public.complete_summary_render($1,$2,$3,7) AS result",
            [job.jobId, b, output],
          )
        ).rows[0]!.result,
      ).toBeNull();
    }
    expect(
      (
        await processing.pool.query<{ result: unknown }>(
          "SELECT public.complete_summary_render($1,$2,$3,7) AS result",
          [job.jobId, a, badOutput],
        )
      ).rows[0]!.result,
    ).toBeNull();
    expect(
      (
        await processing.pool.query<{ result: boolean }>(
          "SELECT public.fail_summary_render($1,$2,false) AS result",
          [job.jobId, a],
        )
      ).rows[0]!.result,
    ).toBe(false);
    await processing.pool.query("SELECT public.fail_summary_render($1,$2,true)", [job.jobId, b]);
    expect(await acquire(randomUUID())).toEqual({ terminal: true });
  });
  it("authorizes summary downloads and expires them relative to publication", async () => {
    const service = new RenderingService({ database: runtime } as unknown as DatabaseService);
    const outputs = await service.list("summary-owner", project),
      output = outputs[0]!;
    const download = await service.download("summary-owner", project, output.id);
    expect(download.fileSizeBytes).toBeGreaterThan(0);
    expect(Date.parse(output.expiresAt) - Date.parse(output.createdAt)).toBeCloseTo(
      7 * 86400000,
      -3,
    );
    await expect(service.download("another-user", project, output.id)).rejects.toMatchObject({
      status: 404,
    });
    await owner.pool.query(
      "UPDATE rendered_outputs SET expires_at=created_at+interval '1 millisecond',created_at=now()-interval '1 day' WHERE id=$1",
      [output.id],
    );
    // Both timestamps are now in the past; keep the publication ordering constraint valid.
    await owner.pool.query(
      "UPDATE rendered_outputs SET expires_at=created_at+interval '1 second' WHERE id=$1",
      [output.id],
    );
    await expect(service.download("summary-owner", project, output.id)).rejects.toMatchObject({
      status: 410,
    });
  });
  it("recovers Redis outage and transient media failure through the actual summary queue", async () => {
    const prefix = `vs8-${randomUUID()}`,
      redisUrl = process.env.TEST_REDIS_URL ?? "redis://localhost:6379";
    vi.stubEnv("BULLMQ_PREFIX", prefix);
    const redis = new Redis(redisUrl, { maxRetriesPerRequest: 1 });
    const factory = (url: string) =>
      new BullMqConnectionFactory({
        redisUrl: url,
        random: () => 0,
        createClient: (target, options) => new Redis(target, options),
      });
    const offlineConnections = factory("redis://127.0.0.1:1"),
      connections = factory(redisUrl),
      scoped = { database: processing } as unknown as ScopedDatabaseService;
    const offline = new RenderDispatcherService(scoped, offlineConnections),
      dispatcher = new RenderDispatcherService(scoped, connections);
    const config = {
      ...loadWorkerConfig(),
      bullmqPrefix: prefix,
      redisUrl,
      storageRoot: resolve("storage"),
      ffmpegPath: "vs8-missing-ffmpeg",
      render: { ...loadWorkerConfig().render, ffprobePath: "ffprobe", preset: "ultrafast" },
    };
    const worker = new RenderWorkerService(
      client(runtimeUrl, "repurposepro_processing", database),
      config,
    );
    const job = await start(summaryStateSchema.parse(await get()).revision);
    try {
      await offline.dispatch();
      expect(
        (
          await owner.pool.query<{ status: string }>(
            "SELECT status FROM processing_jobs WHERE id=$1",
            [job.jobId],
          )
        ).rows[0]!.status,
      ).toBe("queued");
      await owner.pool.query(
        "UPDATE processing_job_dispatches SET next_attempt_at=now() WHERE processing_job_id=$1",
        [job.jobId],
      );
      await worker.onModuleInit();
      await connections.createProducer().connect();
      await dispatcher.dispatch();
      await vi.waitFor(
        async () =>
          expect(
            (
              await owner.pool.query(
                "SELECT status,attempt_count FROM processing_jobs WHERE id=$1",
                [job.jobId],
              )
            ).rows[0],
          ).toMatchObject({ status: "queued", attempt_count: 1 }),
        { timeout: 10000, interval: 100 },
      );
      config.ffmpegPath = "ffmpeg";
      await vi.waitFor(
        async () =>
          expect(
            (
              await owner.pool.query(
                "SELECT status,attempt_count FROM processing_jobs WHERE id=$1",
                [job.jobId],
              )
            ).rows[0],
          ).toMatchObject({ status: "completed", attempt_count: 2 }),
        { timeout: 20000, interval: 100 },
      );
      expect(
        (
          await owner.pool.query<{ count: string }>(
            "SELECT count(*) FROM rendered_outputs WHERE render_job_id=$1",
            [job.jobId],
          )
        ).rows[0]!.count,
      ).toBe("1");
    } finally {
      await worker.onModuleDestroy();
      await Promise.all([offline.onModuleDestroy(), dispatcher.onModuleDestroy()]);
      await Promise.all([offlineConnections.onModuleDestroy(), connections.onModuleDestroy()]);
      let cursor = "0";
      do {
        const [next, keys] = await redis.scan(cursor, "MATCH", `${prefix}:*`, "COUNT", 100);
        cursor = next;
        if (keys.length) await redis.del(...keys);
      } while (cursor !== "0");
      await redis.quit();
      vi.unstubAllEnvs();
    }
  }, 60000);
  it("normalizes rotated non-square-pixel sources into a source-shaped export", async () => {
    const anamorphic = join(directory, "anamorphic.mp4"),
      rotated = join(directory, "rotated.mp4");
    await runMedia(
      "ffmpeg",
      [
        "-y",
        "-i",
        source,
        "-vf",
        "scale=320:180,setsar=2",
        "-c:v",
        "libx264",
        "-preset",
        "ultrafast",
        "-c:a",
        "copy",
        anamorphic,
      ],
      { timeoutMs: 30000 },
    );
    await runMedia(
      "ffmpeg",
      ["-y", "-display_rotation", "90", "-i", anamorphic, "-c", "copy", rotated],
      { timeoutMs: 30000 },
    );
    await owner.pool.query(
      "UPDATE uploaded_videos SET storage_path=$1,file_size_bytes=$2 WHERE id=$3",
      [rotated, (await stat(rotated)).size, video],
    );
    const job = await start(summaryStateSchema.parse(await get()).revision);
    await new SummaryRenderer(processing, {
      ...loadWorkerConfig(),
      storageRoot: resolve("storage"),
      ffmpegPath: "ffmpeg",
      render: { ...loadWorkerConfig().render, ffprobePath: "ffprobe", preset: "ultrafast" },
    }).process(job.jobId, project);
    const path = (
      await owner.pool.query<{ storage_path: string }>(
        "SELECT storage_path FROM rendered_outputs WHERE render_job_id=$1",
        [job.jobId],
      )
    ).rows[0]!.storage_path;
    const probe = await probeMedia("ffprobe", path),
      v = probe.streams.find((s) => s.codec_type === "video")!;
    expect(v.sample_aspect_ratio).toBe("1:1");
    expect(v.width % 2).toBe(0);
    expect(v.height % 2).toBe(0);
    expect(v.width / v.height).toBeCloseTo(180 / 640, 3);
    expect(
      v.side_data_list?.some((s) => s.rotation && Math.abs(s.rotation) % 360 !== 0) ?? false,
    ).toBe(false);
    await owner.pool.query(
      "UPDATE uploaded_videos SET storage_path=$1,file_size_bytes=$2 WHERE id=$3",
      [source, (await stat(source)).size, video],
    );
  }, 60000);
  it("keeps later analyses isolated with analysis-scoped ordering and segment identities", async () => {
    const old = summaryStateSchema.parse(await get()),
      next = randomUUID(),
      lease = randomUUID();
    await owner.pool.query(
      "INSERT INTO processing_jobs(id,project_id,user_id,type,status,step,credits_charged,execution_lease_token,execution_lease_owner,execution_lease_expires_at,execution_heartbeat_at) VALUES($1,$2,'summary-owner','analyze_video','active','analyzing',1,$3,'summary-test',now()+interval '1 hour',now())",
      [next, project, lease],
    );
    await owner.pool.query("UPDATE projects SET current_job_id=$1,status='analyzing' WHERE id=$2", [
      next,
      project,
    ]);
    await owner.pool.query(
      "INSERT INTO transcripts(project_id,processing_job_id,uploaded_video_id,language,model,duration_seconds,text) VALUES($1,$2,$3,'en','fixture',20,'A newer analysis')",
      [project, next, video],
    );
    expect(
      (
        await processing.pool.query<{ result: string }>(
          "SELECT public.finalize_summary_preview($1,'summary-test',$2,$3) AS result",
          [next, lease, JSON.stringify([{ startTime: 1, endTime: 3, reason: "New idea" }])],
        )
      ).rows[0]!.result,
    ).toBe("created");
    const state = summaryStateSchema.parse(await get());
    expect(state.analysisJobId).toBe(next);
    expect(state.revision).toBe(0);
    expect(state.segments[0]!.order).toBe(0);
    expect(
      await save(
        0,
        old.segments.map(({ id, startTime, endTime, selected }) => ({
          id,
          startTime,
          endTime,
          selected,
        })),
      ),
    ).toEqual({ error: "VALIDATION_ERROR" });
    expect(
      (
        await owner.pool.query<{ count: string }>(
          "SELECT count(*) FROM summaries WHERE project_id=$1",
          [project],
        )
      ).rows[0]!.count,
    ).toBe("2");
  });
});
