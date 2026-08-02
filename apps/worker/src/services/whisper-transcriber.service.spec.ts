import type { ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { join, resolve } from "node:path";
import { PassThrough } from "node:stream";

import { afterEach, describe, expect, it, vi, type Mock } from "vitest";

import { WhisperTranscriber, type WhisperSpawn } from "./whisper-transcriber.service";

interface FakeChild extends ChildProcess {
  readonly killMock: Mock<(signal?: number | NodeJS.Signals) => boolean>;
  readonly stderr: PassThrough;
  readonly stdout: PassThrough;
}

function fakeChild(): FakeChild {
  const child = new EventEmitter() as FakeChild;
  const killMock = vi.fn<(signal?: number | NodeJS.Signals) => boolean>(() => true);
  Object.defineProperties(child, {
    kill: { value: killMock },
    killMock: { value: killMock },
    stderr: { value: new PassThrough() },
    stdout: { value: new PassThrough() },
  });
  return child;
}

function createTranscriber(spawnProcess: WhisperSpawn, timeoutMs = 1_000): WhisperTranscriber {
  return new WhisperTranscriber({
    computeType: "int8",
    device: "cpu",
    enableWordTimestamps: false,
    language: "en",
    model: "small.en",
    pythonPath: "C:/runtime/python.exe",
    scriptPath: "C:/repo/apps/worker/python/transcribe.py",
    spawnProcess,
    storageRoot: resolve("storage"),
    timeoutMs,
  });
}

const validTranscript = {
  durationSeconds: 30,
  language: "en",
  segments: [
    {
      endSeconds: 4.5,
      sequence: 0,
      startSeconds: 1.25,
      text: "A useful opening.",
      words: null,
    },
  ],
  text: "A useful opening.",
};

afterEach(() => {
  vi.useRealTimers();
});

describe("WhisperTranscriber", () => {
  it("runs isolated Python without a shell and parses timestamped JSON", async () => {
    const child = fakeChild();
    const spawnProcess = vi.fn<WhisperSpawn>(() => {
      queueMicrotask(() => {
        child.stdout.write(JSON.stringify(validTranscript));
        child.emit("close", 0, null);
      });
      return child;
    });
    const transcriber = createTranscriber(spawnProcess);
    const audioPath = join(resolve("storage"), "project", "audio.wav");

    await expect(
      transcriber.transcribe({ audioPath, signal: new AbortController().signal }),
    ).resolves.toEqual(validTranscript);

    expect(spawnProcess).toHaveBeenCalledWith(
      "C:/runtime/python.exe",
      [
        "C:/repo/apps/worker/python/transcribe.py",
        "--audio",
        audioPath,
        "--model",
        "small.en",
        "--device",
        "cpu",
        "--compute-type",
        "int8",
        "--language",
        "en",
      ],
      { shell: false, stdio: ["ignore", "pipe", "pipe"], windowsHide: true },
    );
  });

  it("rejects malformed JSON and out-of-duration timestamps", async () => {
    const outputs = ["not-json", JSON.stringify({ ...validTranscript, durationSeconds: 2 })];

    for (const output of outputs) {
      const child = fakeChild();
      const spawnProcess = vi.fn<WhisperSpawn>(() => {
        queueMicrotask(() => {
          child.stdout.write(output);
          child.emit("close", 0, null);
        });
        return child;
      });

      await expect(
        createTranscriber(spawnProcess).transcribe({
          audioPath: join(resolve("storage"), "audio.wav"),
          signal: new AbortController().signal,
        }),
      ).rejects.toMatchObject({ reason: "invalid_output" });
    }
  });

  it("preserves the lease-loss abort reason and stops Python", async () => {
    const child = fakeChild();
    const spawnProcess = vi.fn<WhisperSpawn>(() => child);
    const controller = new AbortController();
    const leaseLoss = new Error("Processing execution lease was lost.");
    const transcription = createTranscriber(spawnProcess).transcribe({
      audioPath: join(resolve("storage"), "audio.wav"),
      signal: controller.signal,
    });

    controller.abort(leaseLoss);

    await expect(transcription).rejects.toBe(leaseLoss);
    expect(child.killMock).toHaveBeenCalledOnce();
  });

  it("wraps non-error abort reasons in a transcription error", async () => {
    const child = fakeChild();
    const controller = new AbortController();
    const transcription = createTranscriber(() => child).transcribe({
      audioPath: join(resolve("storage"), "audio.wav"),
      signal: controller.signal,
    });

    controller.abort("cancelled");

    await expect(transcription).rejects.toMatchObject({
      cause: "cancelled",
      reason: "aborted",
    });
    expect(child.killMock).toHaveBeenCalledOnce();
  });

  it("times out and kills a stalled Python process", async () => {
    vi.useFakeTimers();
    const child = fakeChild();
    const transcription = createTranscriber(() => child, 500).transcribe({
      audioPath: join(resolve("storage"), "audio.wav"),
      signal: new AbortController().signal,
    });
    const rejection = expect(transcription).rejects.toMatchObject({ reason: "timeout" });

    await vi.advanceTimersByTimeAsync(500);

    await rejection;
    expect(child.killMock).toHaveBeenCalledOnce();

    await vi.advanceTimersByTimeAsync(5_000);
    expect(child.killMock).toHaveBeenLastCalledWith("SIGKILL");
  });

  it("bounds subprocess output and rejects paths outside storage", async () => {
    const child = fakeChild();
    const spawnProcess = vi.fn<WhisperSpawn>(() => {
      queueMicrotask(() => child.stdout.write(Buffer.alloc(16 * 1024 * 1024 + 1)));
      return child;
    });
    const transcriber = createTranscriber(spawnProcess);

    await expect(
      transcriber.transcribe({
        audioPath: join(resolve("storage"), "large.wav"),
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({ reason: "output_too_large" });
    expect(child.killMock).toHaveBeenCalledOnce();

    await expect(
      transcriber.transcribe({
        audioPath: resolve("outside.wav"),
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({ reason: "storage_failed" });
    expect(spawnProcess).toHaveBeenCalledOnce();
  });
});
