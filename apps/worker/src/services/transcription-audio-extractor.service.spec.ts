import { EventEmitter } from "node:events";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import type { ChildProcess } from "node:child_process";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  TranscriptionAudioExtractionError,
  TranscriptionAudioExtractor,
  type FfmpegSpawn,
} from "./transcription-audio-extractor.service";

const roots: string[] = [];

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "repurposepro-audio-"));
  roots.push(root);
  return root;
}

function fakeChild(): ChildProcess & { readonly stderr: PassThrough } {
  const child = new EventEmitter() as ChildProcess & { readonly stderr: PassThrough };
  Object.defineProperty(child, "stderr", {
    configurable: false,
    enumerable: true,
    value: new PassThrough(),
    writable: false,
  });
  return child;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

describe("TranscriptionAudioExtractor", () => {
  it("extracts the first audio stream to a promoted mono 16 kHz PCM WAV", async () => {
    const root = await temporaryRoot();
    const sourcePath = join(root, "source", "video");
    const destinationPath = join(root, "audio", "audio.wav");
    await mkdir(join(root, "source"));
    await writeFile(sourcePath, "source-video");
    const child = fakeChild();
    const spawnProcess = vi.fn<FfmpegSpawn>((_binary, arguments_) => {
      const temporaryPath = arguments_.at(-1);
      if (!temporaryPath) {
        throw new Error("Missing temporary output path.");
      }

      void writeFile(temporaryPath, "fresh-wave-audio").then(() => {
        child.emit("close", 0, null);
      });
      return child;
    });
    const signal = new AbortController().signal;
    const extractor = new TranscriptionAudioExtractor({
      createTemporaryId: () => "attempt-1",
      ffmpegPath: "C:/tools/ffmpeg.exe",
      spawnProcess,
    });

    await expect(extractor.extract({ destinationPath, signal, sourcePath })).resolves.toEqual({
      outputPath: destinationPath,
    });

    expect(spawnProcess).toHaveBeenCalledWith(
      "C:/tools/ffmpeg.exe",
      [
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
        join(root, "audio", ".audio.wav.attempt-1.tmp.wav"),
      ],
      {
        shell: false,
        signal,
        stdio: ["ignore", "ignore", "pipe"],
        windowsHide: true,
      },
    );
    await expect(readFile(destinationPath, "utf8")).resolves.toBe("fresh-wave-audio");
    await expect(readdir(join(root, "audio"))).resolves.toEqual(["audio.wav"]);
  });

  it("replaces a previous completed output only after the retry succeeds", async () => {
    const root = await temporaryRoot();
    const sourcePath = join(root, "source-video");
    const destinationPath = join(root, "audio", "audio.wav");
    await writeFile(sourcePath, "source-video");
    await mkdir(join(root, "audio"));
    await writeFile(destinationPath, "previous-wave-audio");

    const child = fakeChild();
    const spawnProcess = vi.fn<FfmpegSpawn>((_binary, arguments_) => {
      const temporaryPath = arguments_.at(-1);
      if (!temporaryPath) throw new Error("Missing temporary output path.");
      void writeFile(temporaryPath, "replacement-wave-audio").then(() => {
        child.emit("close", 0, null);
      });
      return child;
    });
    const extractor = new TranscriptionAudioExtractor({
      createTemporaryId: () => "retry",
      ffmpegPath: "ffmpeg",
      spawnProcess,
    });

    await extractor.extract({
      destinationPath,
      signal: new AbortController().signal,
      sourcePath,
    });

    await expect(readFile(destinationPath, "utf8")).resolves.toBe("replacement-wave-audio");
    await expect(readdir(join(root, "audio"))).resolves.toEqual(["audio.wav"]);
  });

  it("preserves the completed output and removes the temporary file when FFmpeg fails", async () => {
    const root = await temporaryRoot();
    const sourcePath = join(root, "source-video");
    const destinationPath = join(root, "audio", "audio.wav");
    await writeFile(sourcePath, "source-video");
    await mkdir(join(root, "audio"));
    await writeFile(destinationPath, "previous-wave-audio");
    const child = fakeChild();
    const spawnProcess = vi.fn<FfmpegSpawn>((_binary, arguments_) => {
      const temporaryPath = arguments_.at(-1);
      if (!temporaryPath) throw new Error("Missing temporary output path.");
      void writeFile(temporaryPath, "partial-wave-audio").then(() => {
        child.stderr?.write("decoder failed");
        child.emit("close", 1, null);
      });
      return child;
    });
    const extractor = new TranscriptionAudioExtractor({
      createTemporaryId: () => "failed-retry",
      ffmpegPath: "ffmpeg",
      spawnProcess,
    });

    await expect(
      extractor.extract({
        destinationPath,
        signal: new AbortController().signal,
        sourcePath,
      }),
    ).rejects.toMatchObject({
      message: "Transcription audio extraction failed.",
      reason: "ffmpeg_failed",
    });

    await expect(readFile(destinationPath, "utf8")).resolves.toBe("previous-wave-audio");
    await expect(readdir(join(root, "audio"))).resolves.toEqual(["audio.wav"]);
  });

  it("reports an invalid output when FFmpeg exits successfully without writing audio", async () => {
    const root = await temporaryRoot();
    const sourcePath = join(root, "source-video");
    const destinationPath = join(root, "audio", "audio.wav");
    await writeFile(sourcePath, "source-video");
    const child = fakeChild();
    const spawnProcess = vi.fn<FfmpegSpawn>(() => {
      queueMicrotask(() => child.emit("close", 0, null));
      return child;
    });
    const extractor = new TranscriptionAudioExtractor({
      createTemporaryId: () => "empty-output",
      ffmpegPath: "ffmpeg",
      spawnProcess,
    });

    await expect(
      extractor.extract({
        destinationPath,
        signal: new AbortController().signal,
        sourcePath,
      }),
    ).rejects.toMatchObject({
      message: "Transcription audio extraction failed.",
      reason: "invalid_output",
    });
  });

  it("bounds FFmpeg diagnostics without exposing paths in the public error", async () => {
    const root = await temporaryRoot();
    const sourcePath = join(root, "private-source-video");
    const destinationPath = join(root, "private-audio.wav");
    await writeFile(sourcePath, "source-video");
    const child = fakeChild();
    const spawnProcess = vi.fn<FfmpegSpawn>(() => {
      queueMicrotask(() => {
        child.stderr?.write("x".repeat(70_000));
        child.stderr?.write(sourcePath);
        child.emit("close", 1, null);
      });
      return child;
    });
    const extractor = new TranscriptionAudioExtractor({
      createTemporaryId: () => "bounded-error",
      ffmpegPath: "ffmpeg",
      spawnProcess,
    });

    const error = await extractor
      .extract({
        destinationPath,
        signal: new AbortController().signal,
        sourcePath,
      })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(TranscriptionAudioExtractionError);
    expect((error as Error).message).not.toContain(sourcePath);
    expect((error as Error).message).not.toContain(destinationPath);
    const cause = (error as Error & { cause?: { diagnostic?: string } }).cause;
    expect(cause?.diagnostic?.length).toBeLessThanOrEqual(65_536);
  });

  it("classifies a child-process spawn error separately", async () => {
    const root = await temporaryRoot();
    const sourcePath = join(root, "source-video");
    const destinationPath = join(root, "audio.wav");
    await writeFile(sourcePath, "source-video");
    const child = fakeChild();
    const spawnProcess = vi.fn<FfmpegSpawn>(() => {
      queueMicrotask(() => child.emit("error", new Error("spawn ENOENT C:/private/ffmpeg")));
      return child;
    });
    const extractor = new TranscriptionAudioExtractor({
      createTemporaryId: () => "spawn-error",
      ffmpegPath: "C:/private/ffmpeg",
      spawnProcess,
    });

    await expect(
      extractor.extract({
        destinationPath,
        signal: new AbortController().signal,
        sourcePath,
      }),
    ).rejects.toMatchObject({
      message: "Transcription audio extraction failed.",
      reason: "spawn_failed",
    });
  });

  it("propagates the original lease-loss abort reason and cleans up", async () => {
    const root = await temporaryRoot();
    const sourcePath = join(root, "source-video");
    const destinationPath = join(root, "audio", "audio.wav");
    await writeFile(sourcePath, "source-video");
    const child = fakeChild();
    const spawnProcess = vi.fn<FfmpegSpawn>((_binary, arguments_, options) => {
      const temporaryPath = arguments_.at(-1);
      if (!temporaryPath) throw new Error("Missing temporary output path.");
      void writeFile(temporaryPath, "partial-wave-audio");
      options.signal?.addEventListener(
        "abort",
        () => child.emit("error", new DOMException("Aborted", "AbortError")),
        { once: true },
      );
      return child;
    });
    const controller = new AbortController();
    const leaseLoss = new Error("Processing execution lease was lost.");
    const extractor = new TranscriptionAudioExtractor({
      createTemporaryId: () => "lease-loss",
      ffmpegPath: "ffmpeg",
      spawnProcess,
    });

    const extraction = extractor.extract({
      destinationPath,
      signal: controller.signal,
      sourcePath,
    });
    controller.abort(leaseLoss);

    await expect(extraction).rejects.toBe(leaseLoss);
    await expect(readdir(join(root, "audio"))).resolves.toEqual([]);
  });

  it("does not promote audio when the lease is lost as FFmpeg finishes", async () => {
    const root = await temporaryRoot();
    const sourcePath = join(root, "source-video");
    const destinationPath = join(root, "audio", "audio.wav");
    await writeFile(sourcePath, "source-video");
    const controller = new AbortController();
    const leaseLoss = new Error("Processing execution lease was lost.");
    const child = fakeChild();
    const spawnProcess = vi.fn<FfmpegSpawn>((_binary, arguments_) => {
      const temporaryPath = arguments_.at(-1);
      if (!temporaryPath) throw new Error("Missing temporary output path.");
      void writeFile(temporaryPath, "complete-wave-audio").then(() => {
        child.emit("close", 0, null);
        controller.abort(leaseLoss);
      });
      return child;
    });
    const extractor = new TranscriptionAudioExtractor({
      createTemporaryId: () => "late-lease-loss",
      ffmpegPath: "ffmpeg",
      spawnProcess,
    });

    await expect(
      extractor.extract({ destinationPath, signal: controller.signal, sourcePath }),
    ).rejects.toBe(leaseLoss);
    await expect(readdir(join(root, "audio"))).resolves.toEqual([]);
  });

  it("rejects non-absolute storage paths with a safe storage failure", async () => {
    const spawnProcess = vi.fn<FfmpegSpawn>();
    const extractor = new TranscriptionAudioExtractor({
      ffmpegPath: "ffmpeg",
      spawnProcess,
    });

    await expect(
      extractor.extract({
        destinationPath: "audio/audio.wav",
        signal: new AbortController().signal,
        sourcePath: "source/video",
      }),
    ).rejects.toMatchObject({
      message: "Transcription audio extraction failed.",
      reason: "storage_failed",
    });
    expect(spawnProcess).not.toHaveBeenCalled();
  });
});
