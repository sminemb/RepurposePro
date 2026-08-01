import { spawn, type ChildProcess, type SpawnOptions } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, rename, rm, stat } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

const MAX_FFMPEG_DIAGNOSTIC_BYTES = 65_536;

export type TranscriptionAudioExtractionFailureReason =
  "ffmpeg_failed" | "invalid_output" | "spawn_failed" | "storage_failed";

export interface TranscriptionAudioExtractionInput {
  readonly destinationPath: string;
  readonly signal: AbortSignal;
  readonly sourcePath: string;
}

export interface TranscriptionAudioExtractionResult {
  readonly outputPath: string;
}

export type FfmpegSpawn = (
  command: string,
  arguments_: readonly string[],
  options: SpawnOptions,
) => ChildProcess;

export interface TranscriptionAudioExtractorOptions {
  readonly createTemporaryId?: () => string;
  readonly ffmpegPath: string;
  readonly spawnProcess?: FfmpegSpawn;
  readonly storageRoot: string;
}

export class TranscriptionAudioExtractionError extends Error {
  public readonly reason: TranscriptionAudioExtractionFailureReason;

  public constructor(reason: TranscriptionAudioExtractionFailureReason, options?: ErrorOptions) {
    super("Transcription audio extraction failed.", options);
    this.name = "TranscriptionAudioExtractionError";
    this.reason = reason;
  }
}

class FfmpegProcessFailure extends Error {
  public readonly diagnostic: string;
  public readonly reason: "ffmpeg_failed" | "spawn_failed";

  public constructor(
    reason: "ffmpeg_failed" | "spawn_failed",
    diagnostic: string,
    options?: ErrorOptions,
  ) {
    super("FFmpeg process failed.", options);
    this.name = "FfmpegProcessFailure";
    this.diagnostic = diagnostic;
    this.reason = reason;
  }
}

const defaultSpawn: FfmpegSpawn = (command, arguments_, options) =>
  spawn(command, [...arguments_], options);

export class TranscriptionAudioExtractor {
  private readonly createTemporaryId: () => string;
  private readonly ffmpegPath: string;
  private readonly spawnProcess: FfmpegSpawn;
  private readonly storageRoot: string;

  public constructor(options: TranscriptionAudioExtractorOptions) {
    this.createTemporaryId = options.createTemporaryId ?? randomUUID;
    this.ffmpegPath = options.ffmpegPath;
    this.spawnProcess = options.spawnProcess ?? defaultSpawn;
    this.storageRoot = resolve(options.storageRoot);
  }

  public async extract(
    input: TranscriptionAudioExtractionInput,
  ): Promise<TranscriptionAudioExtractionResult> {
    throwIfAborted(input.signal);

    if (!isAbsolute(input.sourcePath) || !isAbsolute(input.destinationPath)) {
      throw new TranscriptionAudioExtractionError("storage_failed");
    }

    if (
      !isWithinRoot(this.storageRoot, input.sourcePath) ||
      !isWithinRoot(this.storageRoot, input.destinationPath)
    ) {
      throw new TranscriptionAudioExtractionError("storage_failed");
    }

    const destinationDirectory = dirname(input.destinationPath);
    const temporaryId = this.createTemporaryId();
    if (basename(temporaryId) !== temporaryId || temporaryId.length === 0) {
      throw new TranscriptionAudioExtractionError("storage_failed");
    }

    const temporaryPath = join(
      destinationDirectory,
      `.${basename(input.destinationPath)}.${temporaryId}.tmp.wav`,
    );
    let promoted = false;

    try {
      try {
        await mkdir(destinationDirectory, { recursive: true });
      } catch (error: unknown) {
        throw new TranscriptionAudioExtractionError("storage_failed", { cause: error });
      }

      await this.extractToTemporaryFile(input.sourcePath, temporaryPath, input.signal);
      throwIfAborted(input.signal);
      await this.validateOutput(temporaryPath);
      throwIfAborted(input.signal);

      try {
        await rename(temporaryPath, input.destinationPath);
        promoted = true;
      } catch (error: unknown) {
        throw new TranscriptionAudioExtractionError("storage_failed", { cause: error });
      }

      return { outputPath: input.destinationPath };
    } finally {
      if (!promoted) {
        await rm(temporaryPath, { force: true }).catch(() => undefined);
      }
    }
  }

  private async extractToTemporaryFile(
    sourcePath: string,
    temporaryPath: string,
    signal: AbortSignal,
  ): Promise<void> {
    const arguments_ = [
      "-nostdin",
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-i",
      sourcePath,
      "-map",
      "0:a:0",
      "-vn",
      "-ac",
      "1",
      "-ar",
      "16000",
      "-c:a",
      "pcm_s16le",
      "-f",
      "wav",
      temporaryPath,
    ] as const;

    throwIfAborted(signal);

    try {
      await runFfmpeg(this.ffmpegPath, arguments_, signal, this.spawnProcess);
    } catch (error: unknown) {
      if (signal.aborted) {
        throwAbortReason(signal);
      }

      if (error instanceof FfmpegProcessFailure) {
        throw new TranscriptionAudioExtractionError(error.reason, { cause: error });
      }

      throw new TranscriptionAudioExtractionError("spawn_failed", { cause: error });
    }
  }

  private async validateOutput(temporaryPath: string): Promise<void> {
    try {
      const output = await stat(temporaryPath);
      if (!output.isFile() || output.size <= 0) {
        throw new TranscriptionAudioExtractionError("invalid_output");
      }
    } catch (error: unknown) {
      if (error instanceof TranscriptionAudioExtractionError) {
        throw error;
      }

      throw new TranscriptionAudioExtractionError("invalid_output", { cause: error });
    }
  }
}

function runFfmpeg(
  binary: string,
  arguments_: readonly string[],
  signal: AbortSignal,
  spawnProcess: FfmpegSpawn,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let process: ChildProcess;

    try {
      process = spawnProcess(binary, arguments_, {
        shell: false,
        signal,
        stdio: ["ignore", "ignore", "pipe"],
        windowsHide: true,
      });
    } catch (error: unknown) {
      reject(new FfmpegProcessFailure("spawn_failed", "", { cause: error }));
      return;
    }

    const diagnosticChunks: Buffer[] = [];
    let diagnosticBytes = 0;
    let settled = false;

    const diagnostic = (): string =>
      Buffer.concat(diagnosticChunks, diagnosticBytes).toString("utf8");

    const finish = (error?: FfmpegProcessFailure): void => {
      if (settled) {
        return;
      }

      settled = true;
      if (error) {
        reject(error);
        return;
      }
      resolve();
    };

    process.stderr?.on("data", (chunk: Buffer | string) => {
      if (diagnosticBytes >= MAX_FFMPEG_DIAGNOSTIC_BYTES) {
        return;
      }

      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      const remaining = MAX_FFMPEG_DIAGNOSTIC_BYTES - diagnosticBytes;
      const bounded = buffer.subarray(0, remaining);
      diagnosticChunks.push(bounded);
      diagnosticBytes += bounded.length;
    });
    process.once("error", (error) => {
      finish(new FfmpegProcessFailure("spawn_failed", diagnostic(), { cause: error }));
    });
    process.once("close", (code) => {
      if (code !== 0) {
        finish(new FfmpegProcessFailure("ffmpeg_failed", diagnostic()));
        return;
      }

      finish();
    });
  });
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throwAbortReason(signal);
  }
}

function throwAbortReason(signal: AbortSignal): never {
  throw signal.reason ?? new DOMException("The operation was aborted.", "AbortError");
}

function isWithinRoot(storageRoot: string, path: string): boolean {
  const rootRelativePath = relative(storageRoot, resolve(path));

  return (
    rootRelativePath !== ".." &&
    !rootRelativePath.startsWith(`..${sep}`) &&
    !isAbsolute(rootRelativePath)
  );
}
