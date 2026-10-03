import { assertSafeStoragePath, assertSafeStorageTree } from "@repurposepro/config";
import { resourceQueuePayload } from "../queue-contract";
import { randomUUID, createHash } from "node:crypto";
import { SummaryRenderer } from "./summary-renderer.service";
import { copyFile, mkdir, readFile, rename, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { Logger, type OnModuleInit, type OnModuleDestroy } from "@nestjs/common";
import { type DatabaseClient, closeDatabaseClient } from "@repurposepro/db";
import { type WorkerConfig } from "@repurposepro/config";
import {
  renderSnapshotSchema,
  VIDEO_RENDER_QUEUE,
  RENDER_CLIP_JOB,
  RENDER_SUMMARY_JOB,
  CAPTION_FONT,
} from "@repurposepro/shared";
import { Worker, UnrecoverableError, type Job, type ConnectionOptions } from "bullmq";
import Redis from "ioredis";
import { createCanvas, GlobalFonts } from "@napi-rs/canvas";
import { generateAss } from "./render-subtitles";
import { displayDimensions, probeMedia, renderMp4 } from "./render-ffmpeg";
import { registerJobAsset } from "./storage-registration";

export class RenderWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RenderWorkerService.name);
  private worker?: Worker;
  private connection?: Redis;
  public constructor(
    private readonly database: DatabaseClient,
    private readonly config: WorkerConfig,
  ) {}
  public async onModuleInit() {
    this.connection = new Redis(this.config.redisUrl, { maxRetriesPerRequest: null });
    this.connection.on("error", () => this.logger.warn({ event: "render_redis_unavailable" }));
    this.worker = new Worker(VIDEO_RENDER_QUEUE, (job) => this.process(job), {
      connection: this.connection as unknown as ConnectionOptions,
      prefix: this.config.bullmqPrefix,
      concurrency: 1,
    });
    this.worker.on("error", () => this.logger.warn({ event: "render_worker_error" }));
    await this.worker.waitUntilReady();
  }
  public async onModuleDestroy() {
    await this.worker?.close();
    await this.connection?.quit();
    await closeDatabaseClient(this.database);
  }
  private async safeRemove(path: string, options: Parameters<typeof rm>[1]): Promise<void> {
    await assertSafeStorageTree(this.config.storageRoot, path);
    await rm(path, options);
  }
  private async query<T>(sql: string, args: unknown[]) {
    return (await this.database.pool.query<{ result: T }>(sql, args)).rows[0]?.result;
  }
  public async process(job: Pick<Job, "id" | "name" | "data">) {
    const data = resourceQueuePayload(job, [RENDER_CLIP_JOB, RENDER_SUMMARY_JOB]);
    const jobId = data.jobId,
      token = randomUUID();
    if (job.name === RENDER_SUMMARY_JOB)
      return new SummaryRenderer(this.database, this.config).process(jobId, data.projectId);
    const acquired = await this.query<{ terminal?: boolean }>(
      "SELECT public.acquire_clip_batch_render($1,$2,$3) AS result",
      [jobId, data.projectId, token],
    );
    if (acquired?.terminal) return;
    if (!acquired) throw new Error("Render lease unavailable");
    try {
      for (;;) {
        const raw = await this.query<unknown>(
          "SELECT public.begin_clip_render_item($1,$2) AS result",
          [jobId, token],
        );
        if (!raw) return;
        if (typeof raw === "object" && "retry" in raw) throw new Error("Retry unfinished clips");
        await this.renderItem(jobId, data.projectId, token, raw);
      }
    } catch (error) {
      await this.query("SELECT public.fail_clip_render($1,$2,true,'RENDER_FAILED') AS result", [
        jobId,
        token,
      ]).catch(() => undefined);
      throw error;
    }
  }
  private async renderItem(jobId: string, projectId: string, token: string, raw: unknown) {
    const snapshot = renderSnapshotSchema.parse(raw);
    const controller = new AbortController();
    let progress = 2,
      step = "preparing",
      heartbeat: Promise<void> | undefined;
    const touch = async () => {
      const valid = await this.query<boolean>(
        "SELECT public.touch_clip_render_item($1,$2,$3,$4,$5) AS result",
        [jobId, token, snapshot.clip.id, step, progress],
      );
      if (!valid) throw new Error("Render lease lost");
    };
    const timer = setInterval(() => {
      if (!heartbeat)
        heartbeat = touch()
          .catch(() => controller.abort(new Error("Render lease lost")))
          .finally(() => {
            heartbeat = undefined;
          });
    }, 2000);
    let directory: string | undefined,
      finalPath: string | undefined,
      published = false;
    try {
      if (snapshot.projectId !== projectId || snapshot.sourceExpiresAt.getTime() <= Date.now())
        throw new UnrecoverableError("Source video is unavailable");
      const root = await assertSafeStoragePath(this.config.storageRoot, this.config.storageRoot);
      const source = await assertSafeStoragePath(root, snapshot.sourcePath);
      const sourceInfo = await stat(source);
      if (!sourceInfo.isFile() || sourceInfo.size !== snapshot.sourceFileSizeBytes)
        throw new UnrecoverableError("Source video is unavailable");
      const workRoot = join(root, ".render-staging");
      await assertSafeStoragePath(root, workRoot, true);
      await mkdir(workRoot, { recursive: true });
      directory = join(workRoot, `${jobId}-${token}-${randomUUID()}`);
      await registerJobAsset(
        this.database,
        jobId,
        token,
        directory,
        "render_temp",
        this.config.render.retentionDays,
      );
      await assertSafeStoragePath(root, directory, true);
      await mkdir(directory);
      const font = await readFile(this.config.render.fontPath);
      if (
        createHash("sha256").update(font).digest("hex") !==
        "6342d3ea6dc088b43867f615e807d898adf100c93edb978b8e52c5eb71a264da"
      )
        throw new UnrecoverableError("Caption font is unavailable");
      await mkdir(join(directory, "fonts"));
      await copyFile(this.config.render.fontPath, join(directory, "fonts", "Inter-Black.ttf"));
      if (!GlobalFonts.registerFromPath(this.config.render.fontPath, CAPTION_FONT))
        throw new UnrecoverableError("Caption font is unavailable");
      const context = createCanvas(1, 1).getContext("2d");
      context.font = `900 ${snapshot.clip.previewFontSize}px "${CAPTION_FONT}"`;
      await import("node:fs/promises").then((fs) =>
        fs.writeFile(
          join(directory!, "captions.ass"),
          generateAss(snapshot.clip, (text) => context.measureText(text).width),
          "utf8",
        ),
      );
      const sourceProbe = await probeMedia(
        this.config.render.ffprobePath,
        source,
        controller.signal,
      );
      const video = sourceProbe.streams.find((stream) => stream.codec_type === "video");
      if (!video || !sourceProbe.streams.some((stream) => stream.codec_type === "audio"))
        throw new UnrecoverableError("Source video is unavailable");
      step = "rendering";
      progress = 5;
      await touch();
      await renderMp4({
        ffmpegPath: this.config.ffmpegPath,
        sourcePath: source,
        directory,
        clip: snapshot.clip,
        tracks: snapshot.tracks,
        dimensions: displayDimensions(video),
        timeoutMs: this.config.render.timeoutMs,
        crf: this.config.render.crf,
        preset: this.config.render.preset,
        signal: controller.signal,
        onProgress: (value) => {
          progress = Math.max(progress, value);
        },
      });
      step = "saving_output";
      progress = 97;
      await touch();
      const outputPath = join(directory, "output.mp4");
      const outputProbe = await probeMedia(
        this.config.render.ffprobePath,
        outputPath,
        controller.signal,
      );
      const stream = outputProbe.streams.find((s) => s.codec_type === "video"),
        audio = outputProbe.streams.find((s) => s.codec_type === "audio");
      const duration = Number(outputProbe.format.duration),
        details = await stat(outputPath);
      if (
        stream?.width !== 1080 ||
        stream.height !== 1920 ||
        stream.codec_name !== "h264" ||
        audio?.codec_name !== "aac" ||
        !Number.isFinite(duration) ||
        Math.abs(duration - (snapshot.clip.endTime - snapshot.clip.startTime)) > 0.12 ||
        details.size <= 0
      )
        throw new UnrecoverableError("Output validation failed");
      const target = join(
        root,
        "users",
        encodeURIComponent(snapshot.userId).replaceAll(".", "%2E"),
        "projects",
        snapshot.projectId,
        "renders",
        jobId,
        snapshot.clip.id,
      );
      await assertSafeStoragePath(root, target, true);
      await mkdir(target, { recursive: true });
      finalPath = join(target, `${token}.mp4`);
      await registerJobAsset(
        this.database,
        jobId,
        token,
        finalPath,
        "render_temp",
        this.config.render.retentionDays,
      );
      clearInterval(timer);
      await heartbeat;
      await touch();
      if (controller.signal.aborted) throw controller.signal.reason;
      await assertSafeStoragePath(root, outputPath);
      await assertSafeStoragePath(root, finalPath, true);
      await rename(outputPath, finalPath);
      const id = await this.query<string | null>(
        "SELECT public.complete_clip_render_item($1,$2,$3,$4,$5) AS result",
        [
          jobId,
          token,
          snapshot.clip.id,
          {
            storagePath: finalPath.replaceAll("\\", "/"),
            fileName: `${
              snapshot.clip.title
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "-")
                .replace(/^-|-$/g, "") || "clip"
            }.mp4`,
            fileSizeBytes: details.size,
            durationSeconds: duration,
          },
          this.config.render.retentionDays,
        ],
      );
      if (!id) throw new Error("Render completion lease lost");
      published = true;
      this.logger.log({
        event: "render_completed",
        jobId,
        outputId: id,
        durationSeconds: duration,
      });
    } catch (error: unknown) {
      clearInterval(timer);
      await heartbeat;
      const sourceFailure =
        error instanceof UnrecoverableError && error.message === "Source video is unavailable";
      const retry = !(error instanceof UnrecoverableError) && !controller.signal.aborted;
      const failed = await this.query<boolean>(
        "SELECT public.fail_clip_render_item($1,$2,$3,$4,$5) AS result",
        [
          jobId,
          token,
          snapshot.clip.id,
          retry,
          sourceFailure ? "RENDER_SOURCE_UNAVAILABLE" : "RENDER_FAILED",
        ],
      ).catch(() => false);
      this.logger.warn({ event: "render_failed", jobId, retry });
      if (!failed || controller.signal.aborted) throw error;
    } finally {
      clearInterval(timer);
      await heartbeat;
      if (finalPath && !published) {
        // An interrupted DB response may still have committed. Delete only after proving otherwise.
        const referenced = await this.query<boolean>(
          "SELECT public.clip_render_output_exists($1,$2) AS result",
          [jobId, finalPath.replaceAll("\\", "/")],
        ).catch(() => true);
        if (!referenced) await this.safeRemove(finalPath, { force: true });
      }
      if (directory) await this.safeRemove(directory, { recursive: true, force: true });
    }
  }
}
