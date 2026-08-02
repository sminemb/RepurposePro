import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import type { ProcessingLeaseContext } from "./processing-lifecycle.service";
import {
  type AnalysisTranscriptRepositoryContract,
  type PersistedTranscript,
} from "./analysis-transcript.repository";
import { AnalysisTranscriptService } from "./analysis-transcript.service";
import type { TranscriptionAudioExtractor } from "./transcription-audio-extractor.service";
import type { TimestampedTranscript, WhisperTranscriber } from "./whisper-transcriber.service";

const roots: string[] = [];
const jobId = "00000000-0000-4000-8000-000000000901";
const projectId = "00000000-0000-4000-8000-000000000902";
const transcriptId = "00000000-0000-4000-8000-000000000903";

const transcript: TimestampedTranscript = {
  durationSeconds: 30,
  language: "en",
  segments: [
    {
      endSeconds: 4,
      sequence: 0,
      startSeconds: 1,
      text: "A strong opening.",
      words: null,
    },
  ],
  text: "A strong opening.",
};

const persistedTranscript: PersistedTranscript = {
  ...transcript,
  id: transcriptId,
  model: "small.en",
};

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "repurposepro-transcript-"));
  roots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

describe("AnalysisTranscriptService", () => {
  it("reuses a durable transcript without extracting or invoking Python", async () => {
    const sourcePath = join(await temporaryRoot(), "source", "video.mp4");
    const loadContext = vi
      .fn<AnalysisTranscriptRepositoryContract["loadContext"]>()
      .mockResolvedValue({
        outcome: "transcript_ready",
        projectId,
        sourceDurationSeconds: 30,
        sourcePath,
        transcript: persistedTranscript,
      });
    const repository = repositoryWith(loadContext);
    const extract = vi.fn();
    const transcribe = vi.fn();
    const service = new AnalysisTranscriptService(
      repository,
      { extract } as unknown as TranscriptionAudioExtractor,
      { transcribe } as unknown as WhisperTranscriber,
      "small.en",
    );

    await expect(service.getOrCreate(jobId, leaseContext())).resolves.toEqual({
      sourceDurationSeconds: 30,
      transcript: persistedTranscript,
    });
    expect(extract).not.toHaveBeenCalled();
    expect(transcribe).not.toHaveBeenCalled();
  });

  it("extracts, transcribes, persists idempotently, and removes the WAV", async () => {
    const root = await temporaryRoot();
    const sourcePath = join(root, "project", "source.mp4");
    await mkdir(dirname(sourcePath), { recursive: true });
    await writeFile(sourcePath, "video");
    const loadContext = vi
      .fn<AnalysisTranscriptRepositoryContract["loadContext"]>()
      .mockResolvedValue({
        outcome: "ready",
        projectId,
        sourceDurationSeconds: 30,
        sourcePath,
        transcript: null,
      });
    const persist = vi
      .fn<AnalysisTranscriptRepositoryContract["persist"]>()
      .mockResolvedValue({ outcome: "created", transcriptId });
    const repository = repositoryWith(loadContext, persist);
    const extract = vi.fn(async ({ destinationPath }: { destinationPath: string }) => {
      await mkdir(dirname(destinationPath), { recursive: true });
      await writeFile(destinationPath, "wave");
      return { outputPath: destinationPath };
    });
    const transcribe = vi.fn().mockResolvedValue(transcript);
    const updateProgress = vi.fn().mockResolvedValue(undefined);
    const context = leaseContext(updateProgress);
    const service = new AnalysisTranscriptService(
      repository,
      { extract } as unknown as TranscriptionAudioExtractor,
      { transcribe } as unknown as WhisperTranscriber,
      "small.en",
    );

    await expect(service.getOrCreate(jobId, context)).resolves.toEqual({
      sourceDurationSeconds: 30,
      transcript: persistedTranscript,
    });
    expect(updateProgress.mock.calls).toEqual([
      ["extracting_audio", 25],
      ["transcribing", 45],
    ]);
    expect(persist).toHaveBeenCalledWith(
      jobId,
      "worker-test",
      "00000000-0000-4000-8000-000000000904",
      "small.en",
      transcript,
    );
    await expect(readdir(join(root, "project", ".analysis"))).resolves.toEqual([]);
  });

  it("accepts normal duration drift introduced while extracting audio", async () => {
    const root = await temporaryRoot();
    const sourcePath = join(root, "project", "source.mp4");
    await mkdir(dirname(sourcePath), { recursive: true });
    await writeFile(sourcePath, "video");
    const loadContext = vi
      .fn<AnalysisTranscriptRepositoryContract["loadContext"]>()
      .mockResolvedValue({
        outcome: "ready",
        projectId,
        sourceDurationSeconds: 30,
        sourcePath,
        transcript: null,
      });
    const persist = vi
      .fn<AnalysisTranscriptRepositoryContract["persist"]>()
      .mockResolvedValue({ outcome: "created", transcriptId });
    const repository = repositoryWith(loadContext, persist);
    const extract = vi.fn(async ({ destinationPath }: { destinationPath: string }) => {
      await mkdir(dirname(destinationPath), { recursive: true });
      await writeFile(destinationPath, "wave");
      return { outputPath: destinationPath };
    });
    const transcriptWithTrailingAudioPadding: TimestampedTranscript = {
      ...transcript,
      durationSeconds: 30.075,
      segments: [
        {
          ...transcript.segments[0]!,
          endSeconds: 30.075,
          startSeconds: 29,
        },
      ],
    };
    const transcribe = vi.fn().mockResolvedValue(transcriptWithTrailingAudioPadding);
    const service = new AnalysisTranscriptService(
      repository,
      { extract } as unknown as TranscriptionAudioExtractor,
      { transcribe } as unknown as WhisperTranscriber,
      "small.en",
    );

    await expect(service.getOrCreate(jobId, leaseContext())).resolves.toEqual({
      sourceDurationSeconds: 30,
      transcript: {
        ...persistedTranscript,
        segments: [{ ...persistedTranscript.segments[0]!, endSeconds: 30, startSeconds: 29 }],
      },
    });
    expect(persist).toHaveBeenCalledWith(
      jobId,
      "worker-test",
      "00000000-0000-4000-8000-000000000904",
      "small.en",
      {
        ...transcript,
        segments: [{ ...transcript.segments[0]!, endSeconds: 30, startSeconds: 29 }],
      },
    );
  });
});

function leaseContext(
  updateProgress = vi.fn().mockResolvedValue(undefined),
): ProcessingLeaseContext {
  return {
    finalize: (operation) => operation(),
    leaseToken: "00000000-0000-4000-8000-000000000904",
    signal: new AbortController().signal,
    updateProgress,
    workerId: "worker-test",
  };
}

function repositoryWith(
  loadContext: AnalysisTranscriptRepositoryContract["loadContext"],
  persist: AnalysisTranscriptRepositoryContract["persist"] = vi.fn(),
): AnalysisTranscriptRepositoryContract {
  return { finalizePreview: vi.fn(), isPreviewReady: vi.fn(), loadContext, persist };
}
