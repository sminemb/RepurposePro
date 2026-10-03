import { assertSafeExecutable, assertSafeStoragePath } from "@repurposepro/config";
import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { z } from "zod";
import {
  cropAtTime,
  defaultFraming,
  type ClipPreviewCandidate,
  type FramingTracks,
} from "@repurposepro/shared";

export interface VideoStream {
  width: number;
  height: number;
  sample_aspect_ratio?: string;
  side_data_list?: Array<{ rotation?: number }>;
  codec_type?: string;
  codec_name?: string;
}
export function displayDimensions(stream: VideoStream) {
  const [n, d] = (stream.sample_aspect_ratio ?? "1:1").split(":").map(Number);
  const sar = n && d ? n / d : 1;
  const rotated =
    Math.abs(stream.side_data_list?.find((s) => s.rotation !== undefined)?.rotation ?? 0) % 180 ===
    90;
  return rotated
    ? { width: Math.round(stream.height / sar), height: stream.width }
    : { width: Math.round(stream.width * sar), height: stream.height };
}
export function cropCommands(
  clip: ClipPreviewCandidate,
  tracks: FramingTracks | null,
  dimensions: { width: number; height: number },
  pixelDimensions = dimensions,
) {
  const commands: string[] = [];
  for (let frame = 0; frame < Math.ceil((clip.endTime - clip.startTime) * 30); frame++) {
    const time = frame / 30;
    const crop = clip.framing
      ? cropAtTime(clip.framing, tracks, clip.startTime + time, dimensions, clip)
      : (clip.crop ?? cropAtTime(defaultFraming, null, clip.startTime + time, dimensions, clip));
    commands.push(
      `${Math.max(0, time - 0.000001).toFixed(9)} crop@frame x ${(crop.x * pixelDimensions.width).toFixed(6)}, crop@frame y ${(crop.y * pixelDimensions.height).toFixed(6)};`,
    );
  }
  return commands.join("\n") + "\n";
}
export function parseProgress(line: string, duration: number): number | null {
  if (!line.startsWith("out_time_us=")) return null;
  const value = Number(line.slice(12));
  return Number.isFinite(value)
    ? Math.min(95, Math.max(5, 5 + Math.floor((value / 1_000_000 / duration) * 90)))
    : null;
}
export function runMedia(
  binary: string,
  args: readonly string[],
  options: {
    cwd?: string;
    signal?: AbortSignal;
    timeoutMs: number;
    onLine?: (line: string) => void;
  },
): Promise<string> {
  assertSafeExecutable(
    binary,
    /(?:^|[/\\])ffprobe(?:\.exe)?$/i.test(binary) ? "ffprobe" : "ffmpeg",
  );
  if (
    !Number.isSafeInteger(options.timeoutMs) ||
    options.timeoutMs <= 0 ||
    options.timeoutMs > 3_600_000
  )
    throw new Error("Invalid media time limit.");
  return new Promise((resolve, reject) => {
    if (options.signal?.aborted) {
      reject(new Error("Render cancelled", { cause: options.signal.reason }));
      return;
    }
    const child = spawn(binary, args, {
      cwd: options.cwd,
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "",
      pending = "",
      failure: Error | undefined;
    const abort = () => {
      failure = new Error("Render cancelled", { cause: options.signal?.reason });
      child.kill("SIGKILL");
    };
    const timer = setTimeout(() => {
      failure = new Error("Media process exceeded its time limit");
      child.kill("SIGKILL");
    }, options.timeoutMs);
    options.signal?.addEventListener("abort", abort, { once: true });
    child.stdout.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      if (options.onLine) {
        pending += text;
        const lines = pending.split(/\r?\n/);
        pending = lines.pop() ?? "";
        lines.forEach(options.onLine);
        if (pending.length > 8000) {
          failure = new Error("Media progress output exceeded limit");
          child.kill("SIGKILL");
        }
      } else if (output.length + text.length <= 2_000_000) output += text;
      else {
        failure = new Error("Media process output exceeded limit");
        child.kill("SIGKILL");
      }
    });
    child.stderr.on("data", (chunk: Buffer) => {
      void chunk;
    });
    child.once("error", (error) => {
      void error;
      failure = new Error("Media process could not start.");
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", abort);
      if (failure) reject(failure);
      else if (code !== 0) reject(new Error("Media process failed."));
      else resolve(output);
    });
  });
}
export async function probeMedia(
  binary: string,
  path: string,
  signal?: AbortSignal,
): Promise<{ streams: VideoStream[]; format: { duration: string } }> {
  const output: unknown = JSON.parse(
    await runMedia(
      binary,
      [
        "-v",
        "error",
        "-show_streams",
        "-show_format",
        "-of",
        "json",
        "-protocol_whitelist",
        "file,pipe",
        path,
      ],
      {
        signal,
        timeoutMs: 30000,
      },
    ),
  );
  return z
    .object({
      streams: z
        .array(
          z
            .object({
              width: z.number().int().positive().max(16384).optional(),
              height: z.number().int().positive().max(16384).optional(),
              sample_aspect_ratio: z.string().max(64).optional(),
              side_data_list: z
                .array(z.object({ rotation: z.number().finite().optional() }))
                .max(100)
                .optional(),
              codec_type: z.string().max(32).optional(),
              codec_name: z.string().max(64).optional(),
            })
            .refine(
              (stream) =>
                stream.codec_type !== "video" ||
                (stream.width !== undefined && stream.height !== undefined),
              "Video dimensions are required.",
            ),
        )
        .max(100),
      format: z.object({
        duration: z
          .string()
          .refine(
            (value) =>
              Number.isFinite(Number(value)) && Number(value) > 0 && Number(value) <= 86400,
          ),
      }),
    })
    .parse(output) as { streams: VideoStream[]; format: { duration: string } };
}
export async function renderMp4(input: {
  ffmpegPath: string;
  sourcePath: string;
  directory: string;
  clip: ClipPreviewCandidate;
  tracks: FramingTracks | null;
  dimensions: { width: number; height: number };
  timeoutMs: number;
  crf: number;
  preset: string;
  signal: AbortSignal;
  onProgress: (value: number) => void;
}) {
  await assertSafeStoragePath(input.directory, input.directory);
  await assertSafeStoragePath(input.directory, `${input.directory}/crop.cmd`, true);
  await assertSafeStoragePath(input.directory, `${input.directory}/filter.txt`, true);
  await assertSafeStoragePath(input.directory, `${input.directory}/output.mp4`, true);
  const { clip, dimensions } = input;
  const crop = clip.framing
    ? cropAtTime(clip.framing, input.tracks, clip.startTime, dimensions, clip)
    : (clip.crop ?? cropAtTime(defaultFraming, null, clip.startTime, dimensions, clip));
  // Crop in output-sized pixels: integer crop coordinates then differ by at most one output pixel.
  const scale = Math.max(
    1080 / (crop.width * dimensions.width),
    1920 / (crop.height * dimensions.height),
  );
  const pixelDimensions = {
    width: Math.round(dimensions.width * scale),
    height: Math.round(dimensions.height * scale),
  };
  await writeFile(
    `${input.directory}/crop.cmd`,
    cropCommands(clip, input.tracks, dimensions, pixelDimensions),
    "utf8",
  );
  // Paths in filter scripts are relative to this private working directory, including fonts.
  const filter = `fps=30,setpts=PTS-STARTPTS,scale=round(iw*sar):ih,setsar=1,scale=${pixelDimensions.width}:${pixelDimensions.height},sendcmd=f=crop.cmd,crop@frame=w=${Math.round(crop.width * pixelDimensions.width)}:h=${Math.round(crop.height * pixelDimensions.height)}:x=${(crop.x * pixelDimensions.width).toFixed(6)}:y=${(crop.y * pixelDimensions.height).toFixed(6)}:exact=1,scale=1080:1920,setsar=1${clip.captionsEnabled ? ",ass=filename=captions.ass:fontsdir=fonts:original_size=1080x1920" : ""}`;
  await writeFile(`${input.directory}/filter.txt`, filter, "utf8");
  await runMedia(
    input.ffmpegPath,
    [
      "-hide_banner",
      "-nostdin",
      "-y",
      "-ss",
      String(clip.startTime),
      "-protocol_whitelist",
      "file,pipe",
      "-i",
      input.sourcePath,
      "-t",
      String(clip.endTime - clip.startTime),
      "-map",
      "0:v:0",
      "-map",
      "0:a:0",
      "-filter_script:v",
      "filter.txt",
      "-af",
      "asetpts=PTS-STARTPTS",
      "-c:v",
      "libx264",
      "-preset",
      input.preset,
      "-crf",
      String(input.crf),
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-movflags",
      "+faststart",
      "-progress",
      "pipe:1",
      "-nostats",
      "output.mp4",
    ],
    {
      cwd: input.directory,
      signal: input.signal,
      timeoutMs: input.timeoutMs,
      onLine: (line) => {
        const value = parseProgress(line, clip.endTime - clip.startTime);
        if (value !== null) input.onProgress(value);
      },
    },
  );
}
