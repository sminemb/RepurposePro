import { spawn, type ChildProcess, type SpawnOptions } from "node:child_process";
import { isAbsolute, relative, resolve, sep } from "node:path";

import { z } from "zod";

const MAX_STDOUT_BYTES = 16 * 1024 * 1024;
const MAX_DIAGNOSTIC_BYTES = 65_536;
const TIMESTAMP_TOLERANCE_SECONDS = 0.001;
const TERMINATION_GRACE_MS = 5_000;

const transcriptWordSchema = z
  .object({
    endSeconds: z.number().finite().nonnegative(),
    probability: z.number().finite().min(0).max(1),
    startSeconds: z.number().finite().nonnegative(),
    text: z.string().min(1).max(500),
  })
  .strict();

const transcriptSegmentSchema = z
  .object({
    endSeconds: z.number().finite().positive(),
    sequence: z.number().int().nonnegative(),
    startSeconds: z.number().finite().nonnegative(),
    text: z.string().trim().min(1).max(100_000),
    words: z.array(transcriptWordSchema).max(10_000).nullable(),
  })
  .strict();

export const timestampedTranscriptSchema = z
  .object({
    durationSeconds: z.number().finite().positive().max(86_400),
    language: z.literal("en"),
    segments: z.array(transcriptSegmentSchema).min(1).max(100_000),
    text: z.string().trim().min(1).max(MAX_STDOUT_BYTES),
  })
  .strict()
  .superRefine((transcript, context) => {
    transcript.segments.forEach((segment, index) => {
      if (segment.sequence !== index) {
        context.addIssue({
          code: "custom",
          message: "Transcript segment sequence must be contiguous.",
          path: ["segments", index, "sequence"],
        });
      }
      if (segment.endSeconds <= segment.startSeconds) {
        context.addIssue({
          code: "custom",
          message: "Transcript segment timestamps are invalid.",
          path: ["segments", index, "endSeconds"],
        });
      }
      if (segment.endSeconds > transcript.durationSeconds + TIMESTAMP_TOLERANCE_SECONDS) {
        context.addIssue({
          code: "custom",
          message: "Transcript segment exceeds the transcript duration.",
          path: ["segments", index, "endSeconds"],
        });
      }
      segment.words?.forEach((word, wordIndex) => {
        if (
          word.endSeconds <= word.startSeconds ||
          word.startSeconds < segment.startSeconds - TIMESTAMP_TOLERANCE_SECONDS ||
          word.endSeconds > segment.endSeconds + TIMESTAMP_TOLERANCE_SECONDS
        ) {
          context.addIssue({
            code: "custom",
            message: "Transcript word timestamps are invalid.",
            path: ["segments", index, "words", wordIndex],
          });
        }
      });
    });
  });

export type TimestampedTranscript = z.output<typeof timestampedTranscriptSchema>;
export type TranscriptSegment = TimestampedTranscript["segments"][number];

export type WhisperFailureReason =
  | "aborted"
  | "invalid_output"
  | "output_too_large"
  | "process_failed"
  | "spawn_failed"
  | "storage_failed"
  | "timeout";

export class WhisperTranscriptionError extends Error {
  public constructor(
    public readonly reason: WhisperFailureReason,
    options?: ErrorOptions,
  ) {
    super("Whisper transcription failed.", options);
    this.name = "WhisperTranscriptionError";
  }
}

export type WhisperSpawn = (
  command: string,
  arguments_: readonly string[],
  options: SpawnOptions,
) => ChildProcess;

export interface WhisperTranscriberOptions {
  readonly computeType: string;
  readonly device: "auto" | "cpu" | "cuda";
  readonly enableWordTimestamps: boolean;
  readonly language: "en";
  readonly model: string;
  readonly pythonPath: string;
  readonly scriptPath: string;
  readonly spawnProcess?: WhisperSpawn;
  readonly storageRoot: string;
  readonly timeoutMs: number;
}

export interface WhisperTranscriptionInput {
  readonly audioPath: string;
  readonly signal: AbortSignal;
}

const defaultSpawn: WhisperSpawn = (command, arguments_, options) =>
  spawn(command, [...arguments_], options);

export class WhisperTranscriber {
  private readonly options: WhisperTranscriberOptions;
  private readonly spawnProcess: WhisperSpawn;
  private readonly storageRoot: string;

  public constructor(options: WhisperTranscriberOptions) {
    this.options = options;
    this.spawnProcess = options.spawnProcess ?? defaultSpawn;
    this.storageRoot = resolve(options.storageRoot);
  }

  public async transcribe(input: WhisperTranscriptionInput): Promise<TimestampedTranscript> {
    if (input.signal.aborted) {
      throwAbortReason(input.signal);
    }
    if (!isAbsolute(input.audioPath) || !isWithinRoot(this.storageRoot, input.audioPath)) {
      throw new WhisperTranscriptionError("storage_failed");
    }

    const arguments_ = [
      this.options.scriptPath,
      "--audio",
      input.audioPath,
      "--model",
      this.options.model,
      "--device",
      this.options.device,
      "--compute-type",
      this.options.computeType,
      "--language",
      this.options.language,
      ...(this.options.enableWordTimestamps ? ["--word-timestamps"] : []),
    ];

    const output = await runPython(
      this.options.pythonPath,
      arguments_,
      input.signal,
      this.options.timeoutMs,
      this.spawnProcess,
    );

    let parsed: unknown;
    try {
      parsed = JSON.parse(output);
    } catch (error: unknown) {
      throw new WhisperTranscriptionError("invalid_output", { cause: error });
    }

    const transcript = timestampedTranscriptSchema.safeParse(parsed);
    if (!transcript.success) {
      throw new WhisperTranscriptionError("invalid_output", { cause: transcript.error });
    }
    return transcript.data;
  }
}

function runPython(
  pythonPath: string,
  arguments_: readonly string[],
  signal: AbortSignal,
  timeoutMs: number,
  spawnProcess: WhisperSpawn,
): Promise<string> {
  return new Promise((resolveOutput, rejectOutput) => {
    let child: ChildProcess;
    try {
      child = spawnProcess(pythonPath, arguments_, {
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      });
    } catch (error: unknown) {
      rejectOutput(new WhisperTranscriptionError("spawn_failed", { cause: error }));
      return;
    }

    let settled = false;
    let stdoutBytes = 0;
    let diagnosticBytes = 0;
    let escalationTimer: ReturnType<typeof setTimeout> | undefined;
    const stdout: Buffer[] = [];
    const diagnostics: Buffer[] = [];

    const clearEscalation = (): void => {
      if (escalationTimer !== undefined) {
        clearTimeout(escalationTimer);
        escalationTimer = undefined;
      }
    };
    const finish = (error?: Error, waitForProcessExit = false): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      signal.removeEventListener("abort", onAbort);
      if (!waitForProcessExit) clearEscalation();
      if (error) {
        rejectOutput(error);
      } else {
        resolveOutput(Buffer.concat(stdout, stdoutBytes).toString("utf8"));
      }
    };
    const stop = (error: Error): void => {
      child.kill();
      escalationTimer = setTimeout(() => {
        escalationTimer = undefined;
        child.kill("SIGKILL");
      }, TERMINATION_GRACE_MS);
      escalationTimer.unref?.();
      finish(error, true);
    };
    const onAbort = (): void => {
      stop(abortError(signal));
    };
    const timeout = setTimeout(() => stop(new WhisperTranscriptionError("timeout")), timeoutMs);

    signal.addEventListener("abort", onAbort, { once: true });
    child.stdout?.on("data", (chunk: Buffer | string) => {
      if (settled) return;
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      if (stdoutBytes + buffer.length > MAX_STDOUT_BYTES) {
        stop(new WhisperTranscriptionError("output_too_large"));
        return;
      }
      stdout.push(buffer);
      stdoutBytes += buffer.length;
    });
    child.stderr?.on("data", (chunk: Buffer | string) => {
      if (diagnosticBytes >= MAX_DIAGNOSTIC_BYTES) return;
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      const bounded = buffer.subarray(0, MAX_DIAGNOSTIC_BYTES - diagnosticBytes);
      diagnostics.push(bounded);
      diagnosticBytes += bounded.length;
    });
    child.once("error", (error) => {
      clearEscalation();
      finish(new WhisperTranscriptionError("spawn_failed", { cause: error }));
    });
    child.once("close", (code) => {
      clearEscalation();
      if (settled) return;
      if (code !== 0) {
        finish(
          new WhisperTranscriptionError("process_failed", {
            cause: new Error(Buffer.concat(diagnostics, diagnosticBytes).toString("utf8")),
          }),
        );
        return;
      }
      finish();
    });
  });
}

function isWithinRoot(storageRoot: string, path: string): boolean {
  const rootRelativePath = relative(storageRoot, resolve(path));
  return (
    rootRelativePath !== ".." &&
    !rootRelativePath.startsWith(`..${sep}`) &&
    !isAbsolute(rootRelativePath)
  );
}

function throwAbortReason(signal: AbortSignal): never {
  throw abortError(signal);
}

function abortError(signal: AbortSignal): Error {
  return signal.reason instanceof Error
    ? signal.reason
    : new WhisperTranscriptionError("aborted", { cause: signal.reason });
}
