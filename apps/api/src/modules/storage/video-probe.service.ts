import { spawn } from "node:child_process";

const MAX_PROBE_OUTPUT_BYTES = 1_000_000;
const PROBE_TIMEOUT_MS = 30_000;
const supportedContainerNames = new Set(["matroska", "mov", "mp4", "webm"]);

export interface VideoProbeConfig {
  readonly ffprobePath: string;
  readonly fileRetentionDays: number;
  readonly maxDurationSeconds: number;
}

export interface VideoProbeMetadata {
  readonly audioCodec: string | null;
  readonly durationSeconds: number;
  readonly fps: number | null;
  readonly hasAudio: true;
  readonly height: number;
  readonly videoCodec: string | null;
  readonly width: number;
}

export type ProbeCommandRunner = (binary: string, arguments_: readonly string[]) => Promise<string>;

export type VideoProbeFailure =
  "duration_limit" | "invalid_media" | "missing_audio" | "probe_failed";

export class VideoProbeError extends Error {
  public constructor(
    public readonly failure: VideoProbeFailure,
    message: string,
  ) {
    super(message);
    this.name = "VideoProbeError";
  }
}

type ProbeStream = Record<string, unknown>;

interface ProbeOutput {
  readonly format?: Record<string, unknown>;
  readonly streams?: readonly ProbeStream[];
}

export class VideoProbeService {
  public constructor(
    private readonly config: VideoProbeConfig,
    private readonly runCommand: ProbeCommandRunner = runFfprobe,
  ) {}

  public get fileRetentionDays(): number {
    return this.config.fileRetentionDays;
  }

  public async probe(videoPath: string): Promise<VideoProbeMetadata> {
    try {
      const output = await this.runCommand(this.config.ffprobePath, probeArguments(videoPath));
      return parseVideoProbeOutput(output, this.config.maxDurationSeconds);
    } catch (error) {
      if (error instanceof VideoProbeError) {
        throw error;
      }

      throw new VideoProbeError(
        "probe_failed",
        "We could not validate this video right now. Please try again.",
      );
    }
  }
}

function probeArguments(videoPath: string): readonly string[] {
  return [
    "-v",
    "error",
    "-show_entries",
    "format=duration,format_name:stream=codec_type,codec_name,width,height,avg_frame_rate",
    "-of",
    "json",
    videoPath,
  ];
}

function runFfprobe(binary: string, arguments_: readonly string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const process = spawn(binary, arguments_, {
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    process.stderr?.resume();
    const output: Buffer[] = [];
    let outputBytes = 0;
    let settled = false;
    const timeout = setTimeout(() => finish(new Error("ffprobe timed out.")), PROBE_TIMEOUT_MS);

    const finish = (error?: Error, value?: string): void => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);
      process.kill();

      if (error) {
        reject(error);
        return;
      }

      resolve(value ?? "");
    };

    process.stdout.on("data", (chunk: Buffer) => {
      outputBytes += chunk.length;
      if (outputBytes > MAX_PROBE_OUTPUT_BYTES) {
        finish(new Error("ffprobe output exceeded the limit."));
        return;
      }

      output.push(chunk);
    });
    process.once("error", (error) => finish(error));
    process.once("close", (code) => {
      if (code !== 0) {
        finish(new Error("ffprobe returned a non-zero exit status."));
        return;
      }

      finish(undefined, Buffer.concat(output).toString("utf8"));
    });
  });
}

export function parseVideoProbeOutput(
  output: string,
  maxDurationSeconds: number,
): VideoProbeMetadata {
  const parsed = parseOutput(output);
  const format = parsed.format;
  const streams = parsed.streams;
  const durationSeconds = toFinitePositiveNumber(format?.duration);
  const containerNames = containerNamesFrom(format?.format_name);
  const video = streams?.find((stream) => stream.codec_type === "video");
  const audio = streams?.find((stream) => stream.codec_type === "audio");

  if (!format) {
    throw invalidMedia();
  }

  if (!containerNames.some((name) => supportedContainerNames.has(name))) {
    throw new VideoProbeError("invalid_media", "Upload an MP4, MOV, WebM, or MKV video.");
  }

  if (!durationSeconds || !video) {
    throw invalidMedia();
  }

  if (durationSeconds > maxDurationSeconds) {
    throw new VideoProbeError("duration_limit", "This video is longer than the 30-minute limit.");
  }

  if (!audio) {
    throw new VideoProbeError("missing_audio", "This video does not contain an audio track.");
  }

  const width = toPositiveInteger(video.width);
  const height = toPositiveInteger(video.height);
  if (!width || !height) {
    throw invalidMedia();
  }

  return {
    audioCodec: toOptionalString(audio.codec_name),
    durationSeconds,
    fps: parseFps(video.avg_frame_rate),
    hasAudio: true,
    height,
    videoCodec: toOptionalString(video.codec_name),
    width,
  };
}

function parseOutput(output: string): ProbeOutput {
  try {
    const parsed: unknown = JSON.parse(output);
    if (!isRecord(parsed)) {
      throw new Error("Probe output is not an object.");
    }

    return {
      format: isRecord(parsed.format) ? parsed.format : undefined,
      streams: Array.isArray(parsed.streams)
        ? parsed.streams.filter((stream): stream is ProbeStream => isRecord(stream))
        : undefined,
    };
  } catch {
    throw invalidMedia();
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function containerNamesFrom(value: unknown): readonly string[] {
  return typeof value === "string" ? value.split(",").map((name) => name.trim()) : [];
}

function parseFps(value: unknown): number | null {
  if (typeof value !== "string") {
    return null;
  }

  const [numerator, denominator, ...extra] = value.split("/");
  if (extra.length > 0 || !numerator || !denominator) {
    return null;
  }

  const parsedNumerator = Number(numerator);
  const parsedDenominator = Number(denominator);
  const fps = parsedNumerator / parsedDenominator;
  return Number.isFinite(fps) && fps > 0 ? fps : null;
}

function toFinitePositiveNumber(value: unknown): number | null {
  const number =
    typeof value === "number" || typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(number) && number > 0 ? number : null;
}

function toOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function toPositiveInteger(value: unknown): number | null {
  const number = toFinitePositiveNumber(value);
  return number && Number.isInteger(number) ? number : null;
}

function invalidMedia(): VideoProbeError {
  return new VideoProbeError(
    "invalid_media",
    "We could not read this video. Try a different file.",
  );
}
