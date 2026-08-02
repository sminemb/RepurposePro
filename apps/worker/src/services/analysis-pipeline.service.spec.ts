import { describe, expect, it, vi } from "vitest";

import type { ProcessingLeaseContext } from "./processing-lifecycle.service";
import type {
  AnalysisTranscriptRepositoryContract,
  PersistedTranscript,
} from "./analysis-transcript.repository";
import {
  AnalysisPipelineService,
  AnalysisPreviewFinalizationError,
  deriveCaptionLines,
} from "./analysis-pipeline.service";
import type { AnalysisTranscriptService } from "./analysis-transcript.service";
import type { GeminiClipSelector } from "./gemini-clip-selector.service";
import type { ProcessingLifecycleRepositoryContract } from "./processing-lifecycle.repository";
import {
  ProcessingLeaseLostError,
  ProcessingLifecycleService,
} from "./processing-lifecycle.service";

const jobId = "00000000-0000-4000-8000-000000001001";
const projectId = "00000000-0000-4000-8000-000000001002";
const leaseToken = "00000000-0000-4000-8000-000000001003";

const transcript: PersistedTranscript = {
  durationSeconds: 30,
  id: "00000000-0000-4000-8000-000000001004",
  language: "en",
  model: "small.en",
  segments: [
    {
      endSeconds: 15,
      sequence: 0,
      startSeconds: 0,
      text: "This opening has a clear hook and a complete idea for the audience.",
      words: null,
    },
    {
      endSeconds: 30,
      sequence: 1,
      startSeconds: 15,
      text: "This ending gives the viewer a useful and memorable conclusion.",
      words: null,
    },
  ],
  text: "This opening has a clear hook. This ending gives a useful conclusion.",
};

describe("AnalysisPipelineService", () => {
  it("persists ordered progress and finalizes default browser-preview metadata atomically", async () => {
    const updateProgress = vi
      .fn<ProcessingLeaseContext["updateProgress"]>()
      .mockResolvedValue(undefined);
    const context = leaseContext(updateProgress);
    const getOrCreate = vi.fn(async (_jobId: string, lease: ProcessingLeaseContext) => {
      await lease.updateProgress("extracting_audio", 25);
      await lease.updateProgress("transcribing", 45);
      return { sourceDurationSeconds: 30, transcript };
    });
    const select = vi.fn().mockResolvedValue({
      backup: [
        {
          endTime: 30,
          reason: "Useful conclusion.",
          score: 0.8,
          startTime: 15,
          title: "Conclusion",
        },
      ],
      primary: [
        {
          endTime: 15,
          reason: "Strong hook.",
          score: 0.9,
          startTime: 0,
          title: "Opening",
        },
      ],
      promptVersion: "clips-v1",
    });
    const finalizePreview = vi
      .fn<AnalysisTranscriptRepositoryContract["finalizePreview"]>()
      .mockResolvedValue("created");
    const repository = repositoryWith(finalizePreview);
    const service = new AnalysisPipelineService(
      repository,
      { getOrCreate } as unknown as AnalysisTranscriptService,
      { select } as unknown as GeminiClipSelector,
    );

    await expect(service.handle({ jobId, projectId }, context)).resolves.toEqual({
      outcome: "preview_ready",
    });

    expect(updateProgress.mock.calls).toEqual([
      ["preparing", 10],
      ["extracting_audio", 25],
      ["transcribing", 45],
      ["analyzing", 65],
      ["generating_preview", 80],
      ["generating_preview", 95],
    ]);
    expect(finalizePreview).toHaveBeenCalledWith(jobId, "worker-test", leaseToken, "clips-v1", [
      expect.objectContaining({
        captionPosition: { x: 0.5, y: 0.72 },
        captionStyle: "hormozi",
        captionsEnabled: true,
        crop: null,
        kind: "primary",
        previewFontSize: 48,
        rank: 0,
        title: "Opening",
      }),
      expect.objectContaining({ kind: "backup", rank: 0, title: "Conclusion" }),
    ]);
    const candidates = finalizePreview.mock.calls[0]?.[4];
    expect(candidates?.[0]?.captionLines.length).toBeGreaterThan(0);
    expect(candidates?.[0]?.captionLines.every((line) => line.text.length <= 160)).toBe(true);
  });

  it("recognizes an already-durable preview before lease acquisition", async () => {
    const isPreviewReady = vi.fn().mockResolvedValue(true);
    const repository = repositoryWith(vi.fn(), isPreviewReady);
    const service = new AnalysisPipelineService(
      repository,
      {} as AnalysisTranscriptService,
      {} as GeminiClipSelector,
    );

    await expect(service.isDurablePreviewReady({ jobId, projectId })).resolves.toBe(true);
    expect(isPreviewReady).toHaveBeenCalledWith(jobId, projectId);
  });

  it("surfaces a lost finalization as lease loss", async () => {
    const service = pipelineWithFinalization("lost");

    await expect(
      service.handle({ jobId, projectId }, leaseContext(vi.fn().mockResolvedValue(undefined))),
    ).rejects.toBeInstanceOf(ProcessingLeaseLostError);
  });

  it("classifies a rejected finalization as retryable so the lifecycle releases the lease", async () => {
    const service = pipelineWithFinalization("rejected");
    const release = vi
      .fn<ProcessingLifecycleRepositoryContract["release"]>()
      .mockResolvedValue("released");
    const lifecycle = new ProcessingLifecycleService({
      acquire: vi.fn().mockResolvedValue({
        expiresAt: new Date(Date.now() + 60_000),
        leaseToken,
        outcome: "acquired",
      }),
      release,
      renew: vi.fn().mockResolvedValue("renewed"),
      updateProgress: vi.fn().mockResolvedValue("updated"),
    });

    await expect(
      lifecycle.execute(jobId, projectId, "worker-test", (context) =>
        service.handle({ jobId, projectId }, context),
      ),
    ).rejects.toBeInstanceOf(AnalysisPreviewFinalizationError);
    expect(release).toHaveBeenCalledWith(jobId, "worker-test", leaseToken);
  });

  it("ranks primary preview candidates by descending score", async () => {
    const finalizePreview = vi
      .fn<AnalysisTranscriptRepositoryContract["finalizePreview"]>()
      .mockResolvedValue("created");
    const service = pipelineWithFinalization("created", finalizePreview, [
      { endTime: 15, reason: "Lower score.", score: 0.6, startTime: 0, title: "Lower" },
      { endTime: 30, reason: "Higher score.", score: 0.9, startTime: 15, title: "Higher" },
    ]);

    await service.handle({ jobId, projectId }, leaseContext(vi.fn().mockResolvedValue(undefined)));

    expect(finalizePreview.mock.calls[0]?.[4]).toEqual([
      expect.objectContaining({ rank: 0, title: "Higher" }),
      expect.objectContaining({ rank: 1, title: "Lower" }),
    ]);
  });

  it("derives escaped-data caption lines within clip bounds", () => {
    const lines = deriveCaptionLines(0, 15, [
      {
        endSeconds: 15,
        sequence: 0,
        startSeconds: 0,
        text: "<script>alert('caption')</script> remains plain transcript text for the preview overlay.",
        words: null,
      },
    ]);

    expect(lines.map((line) => line.text).join(" ")).toContain("<script>");
    expect(lines.every((line) => line.startTime >= 0 && line.endTime <= 15)).toBe(true);
  });
});

function pipelineWithFinalization(
  outcome: "created" | "lost" | "rejected",
  finalizePreview: AnalysisTranscriptRepositoryContract["finalizePreview"] = vi
    .fn<AnalysisTranscriptRepositoryContract["finalizePreview"]>()
    .mockResolvedValue(outcome),
  primary = [{ endTime: 15, reason: "Strong hook.", score: 0.9, startTime: 0, title: "Opening" }],
): AnalysisPipelineService {
  return new AnalysisPipelineService(
    repositoryWith(finalizePreview),
    {
      getOrCreate: vi.fn().mockResolvedValue({ sourceDurationSeconds: 30, transcript }),
    } as unknown as AnalysisTranscriptService,
    {
      select: vi.fn().mockResolvedValue({
        backup: [],
        primary,
        promptVersion: "clips-v1",
      }),
    } as unknown as GeminiClipSelector,
  );
}

function leaseContext(
  updateProgress: ProcessingLeaseContext["updateProgress"],
): ProcessingLeaseContext {
  return {
    finalize: (operation) => operation(),
    leaseToken,
    signal: new AbortController().signal,
    updateProgress,
    workerId: "worker-test",
  };
}

function repositoryWith(
  finalizePreview: AnalysisTranscriptRepositoryContract["finalizePreview"],
  isPreviewReady: AnalysisTranscriptRepositoryContract["isPreviewReady"] = vi
    .fn()
    .mockResolvedValue(false),
): AnalysisTranscriptRepositoryContract {
  return {
    finalizePreview,
    isPreviewReady,
    loadContext: vi.fn(),
    persist: vi.fn(),
  };
}
