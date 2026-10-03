import { randomUUID } from "node:crypto";
import { mkdir, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import { registerJobAsset } from "./storage-registration";
import { isAbsolute, join, relative, sep } from "node:path";
import type { DatabaseClient } from "@repurposepro/db";
import type { WorkerConfig } from "@repurposepro/config";
import { z } from "zod";
import { UnrecoverableError } from "bullmq";
import { Logger } from "@nestjs/common";
import { displayDimensions, probeMedia, runMedia } from "./render-ffmpeg";

const snapshotSchema = z
  .object({
    segments: z
      .array(
        z
          .object({
            startTime: z.number().finite().nonnegative(),
            endTime: z.number().finite().positive(),
          })
          .refine((s) => s.endTime > s.startTime),
      )
      .min(1)
      .max(100),
    sourceId: z.uuid(),
    sourcePath: z.string().min(1),
    sourceExpiresAt: z.coerce.date(),
    sourceFileSizeBytes: z.number().int().positive(),
    projectId: z.uuid(),
    userId: z.string().min(1),
    title: z.string(),
  })
  .strict();
export function summaryFilter(
  segments: readonly { startTime: number; endTime: number }[],
  width: number,
  height: number,
) {
  const n = segments.length;
  const lines = [
    `[0:v]scale=${width}:${height},setsar=1,fps=30,split=${n}${segments.map((_, i) => `[v${i}]`).join("")}`,
    `[0:a]asplit=${n}${segments.map((_, i) => `[a${i}]`).join("")}`,
  ];
  segments.forEach((s, i) => {
    lines.push(
      `[v${i}]trim=start=${s.startTime.toFixed(3)}:end=${s.endTime.toFixed(3)},setpts=PTS-STARTPTS[vt${i}]`,
    );
    lines.push(
      `[a${i}]atrim=start=${s.startTime.toFixed(3)}:end=${s.endTime.toFixed(3)},asetpts=PTS-STARTPTS[at${i}]`,
    );
  });
  lines.push(
    `${segments.map((_, i) => `[vt${i}][at${i}]`).join("")}concat=n=${n}:v=1:a=1[vout][aout]`,
  );
  return lines.join(";\n");
}
export class SummaryRenderer {
  private readonly logger = new Logger(SummaryRenderer.name);
  public constructor(
    private readonly database: DatabaseClient,
    private readonly config: WorkerConfig,
  ) {}
  private async query<T>(sql: string, args: unknown[]) {
    return (await this.database.pool.query<{ result: T }>(sql, args)).rows[0]?.result;
  }
  public async process(jobId: string, projectId: string) {
    const token = randomUUID();
    const acquired = await this.query<unknown>(
      "SELECT public.acquire_summary_render($1,$2,$3) AS result",
      [jobId, projectId, token],
    );
    if (acquired && typeof acquired === "object" && "terminal" in acquired) return;
    if (!acquired) throw new Error("Summary render lease unavailable");
    const abort = new AbortController();
    let directory: string | undefined,
      finalPath: string | undefined,
      published = false,
      progress = 2,
      step = "preparing",
      heartbeat: Promise<void> | undefined;
    const touch = async () => {
      if (
        !(await this.query<boolean>("SELECT public.touch_summary_render($1,$2,$3,$4) AS result", [
          jobId,
          token,
          step,
          Math.floor(progress),
        ]))
      )
        throw new Error("Summary render lease lost");
    };
    const timer = setInterval(() => {
      if (!heartbeat)
        heartbeat = touch()
          .catch((e) => abort.abort(e))
          .finally(() => {
            heartbeat = undefined;
          });
    }, 2000);
    try {
      const snapshot = snapshotSchema.parse(acquired);
      if (snapshot.projectId !== projectId || snapshot.sourceExpiresAt.getTime() <= Date.now())
        throw new UnrecoverableError("Source video is unavailable");
      const root = await realpath(this.config.storageRoot),
        source = await realpath(snapshot.sourcePath),
        contained = relative(root, source);
      if (
        isAbsolute(contained) ||
        contained === ".." ||
        contained.startsWith(`..${sep}`) ||
        (await stat(source)).size !== snapshot.sourceFileSizeBytes
      )
        throw new UnrecoverableError("Source video is unavailable");
      const staging = join(root, ".render-staging");
      await mkdir(staging, { recursive: true });
      directory = join(staging, `${jobId}-${token}-${randomUUID()}`);
      await registerJobAsset(
        this.database,
        jobId,
        token,
        directory,
        "render_temp",
        this.config.render.retentionDays,
      );
      await mkdir(directory);
      const probe = await probeMedia(this.config.render.ffprobePath, source, abort.signal),
        video = probe.streams.find((s) => s.codec_type === "video");
      if (!video || !probe.streams.some((s) => s.codec_type === "audio"))
        throw new UnrecoverableError("Source video is unavailable");
      const display = displayDimensions(video),
        width = Math.max(2, Math.round(display.width / 2) * 2),
        height = Math.max(2, Math.round(display.height / 2) * 2);
      const duration = snapshot.segments.reduce((sum, s) => sum + s.endTime - s.startTime, 0);
      let previous = 0;
      for (const s of snapshot.segments) {
        if (s.startTime < previous || s.endTime > Number(probe.format.duration) + 0.001)
          throw new UnrecoverableError("Invalid summary ranges");
        previous = s.endTime;
      }
      await writeFile(
        join(directory, "summary.filter"),
        summaryFilter(snapshot.segments, width, height),
        "utf8",
      );
      step = "rendering";
      progress = 5;
      await touch();
      await runMedia(
        this.config.ffmpegPath,
        [
          "-hide_banner",
          "-nostdin",
          "-y",
          "-i",
          source,
          "-filter_complex_script",
          "summary.filter",
          "-map",
          "[vout]",
          "-map",
          "[aout]",
          "-c:v",
          "libx264",
          "-preset",
          this.config.render.preset,
          "-crf",
          String(this.config.render.crf),
          "-pix_fmt",
          "yuv420p",
          "-c:a",
          "aac",
          "-movflags",
          "+faststart",
          "-progress",
          "pipe:1",
          "output.mp4",
        ],
        {
          cwd: directory,
          signal: abort.signal,
          timeoutMs: this.config.render.timeoutMs,
          onLine: (line) => {
            const m = /^out_time_us=(\d+)$/.exec(line);
            if (m)
              progress = Math.max(progress, Math.min(95, 5 + (Number(m[1]) / 1e6 / duration) * 90));
          },
        },
      );
      step = "saving_output";
      progress = 97;
      await touch();
      const outputPath = join(directory, "output.mp4"),
        output = await probeMedia(this.config.render.ffprobePath, outputPath, abort.signal),
        v = output.streams.find((s) => s.codec_type === "video"),
        a = output.streams.find((s) => s.codec_type === "audio"),
        actual = Number(output.format.duration),
        size = (await stat(outputPath)).size;
      if (
        v?.width !== width ||
        v.height !== height ||
        v.codec_name !== "h264" ||
        a?.codec_name !== "aac" ||
        v.sample_aspect_ratio !== "1:1" ||
        !Number.isFinite(actual) ||
        Math.abs(actual - duration) > Math.max(0.12, snapshot.segments.length * 0.034 + 0.05) ||
        size <= 0
      )
        throw new UnrecoverableError("Summary output validation failed");
      const target = join(
        root,
        "users",
        encodeURIComponent(snapshot.userId).replaceAll(".", "%2E"),
        "projects",
        projectId,
        "renders",
        jobId,
        "summary",
      );
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
      abort.signal.throwIfAborted();
      await rename(outputPath, finalPath);
      const id = await this.query<string | null>(
        "SELECT public.complete_summary_render($1,$2,$3,$4) AS result",
        [
          jobId,
          token,
          {
            storagePath: finalPath.replaceAll("\\", "/"),
            fileName: `${
              snapshot.title
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "-")
                .replace(/^-|-$/g, "")
                .slice(0, 100) || "summary"
            }.mp4`,
            fileSizeBytes: size,
            durationSeconds: actual,
            width,
            height,
            videoCodec: "h264",
            audioCodec: "aac",
          },
          this.config.render.retentionDays,
        ],
      );
      if (!id) throw new Error("Summary publication lease lost");
      published = true;
      this.logger.log({
        event: "summary_render_completed",
        jobId,
        outputId: id,
        durationSeconds: actual,
      });
    } catch (error) {
      const retry = !(error instanceof UnrecoverableError) && !abort.signal.aborted;
      await this.query("SELECT public.fail_summary_render($1,$2,$3) AS result", [
        jobId,
        token,
        retry,
      ]).catch(() => undefined);
      this.logger.warn({ event: "summary_render_failed", jobId, retry });
      throw error;
    } finally {
      clearInterval(timer);
      await heartbeat;
      if (finalPath && !published) {
        const exists = await this.query<boolean>(
          "SELECT public.clip_render_output_exists($1,$2) AS result",
          [jobId, finalPath.replaceAll("\\", "/")],
        ).catch(() => undefined);
        if (exists === false) await rm(finalPath, { force: true });
      }
      if (directory) await rm(directory, { recursive: true, force: true });
    }
  }
}
