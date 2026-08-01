import type { CaptionLine, VideoAnalysisJobPayload } from "@repurposepro/shared";

import type {
  AnalysisPipelineHandler,
  AnalysisPipelineResult,
} from "../processors/analysis-job.processor";
import {
  type AnalysisPreviewCandidateRecord,
  type AnalysisTranscriptRepositoryContract,
} from "./analysis-transcript.repository";
import type {
  AnalysisTranscriptResult,
  AnalysisTranscriptService,
} from "./analysis-transcript.service";
import type {
  GeneratedClipCandidate,
  GeneratedClipSelection,
  GeminiClipSelector,
} from "./gemini-clip-selector.service";
import {
  ProcessingLeaseLostError,
  type ProcessingLeaseContext,
} from "./processing-lifecycle.service";

const PROMPT_VERSION = "clips-v1" as const;

export class AnalysisPreviewFinalizationError extends Error {
  public constructor() {
    super("Analysis preview could not be finalized.");
    this.name = "AnalysisPreviewFinalizationError";
  }
}

export class AnalysisPipelineService implements AnalysisPipelineHandler {
  public constructor(
    private readonly repository: AnalysisTranscriptRepositoryContract,
    private readonly transcripts: AnalysisTranscriptService,
    private readonly selector: GeminiClipSelector,
  ) {}

  public isDurablePreviewReady(payload: VideoAnalysisJobPayload): Promise<boolean> {
    return this.repository.isPreviewReady(payload.jobId, payload.projectId);
  }

  public async handle(
    payload: VideoAnalysisJobPayload,
    context: ProcessingLeaseContext,
  ): Promise<AnalysisPipelineResult> {
    await context.updateProgress("preparing", 10);
    const transcriptResult = await this.transcripts.getOrCreate(payload.jobId, context);
    await context.updateProgress("analyzing", 65);
    const selection = await this.selector.select(
      {
        sourceDurationSeconds: transcriptResult.sourceDurationSeconds,
        transcriptSegments: transcriptResult.transcript.segments.map((segment) => ({
          endTime: segment.endSeconds,
          sequence: segment.sequence,
          startTime: segment.startSeconds,
          text: segment.text,
        })),
      },
      context.signal,
    );

    await context.updateProgress("generating_preview", 80);
    const candidates = createPreviewCandidates(selection, transcriptResult);
    await context.updateProgress("generating_preview", 95);
    const outcome = await context.finalize(() =>
      this.repository.finalizePreview(
        payload.jobId,
        context.workerId,
        context.leaseToken,
        PROMPT_VERSION,
        candidates,
      ),
    );
    if (outcome === "lost") {
      throw new ProcessingLeaseLostError();
    }
    if (outcome === "rejected") {
      throw new AnalysisPreviewFinalizationError();
    }
    return { outcome: "preview_ready" };
  }
}

function createPreviewCandidates(
  selection: GeneratedClipSelection,
  transcriptResult: AnalysisTranscriptResult,
): AnalysisPreviewCandidateRecord[] {
  return [
    ...selection.primary.map((candidate, rank) =>
      createPreviewCandidate("primary", rank, candidate, transcriptResult),
    ),
    ...selection.backup.map((candidate, rank) =>
      createPreviewCandidate("backup", rank, candidate, transcriptResult),
    ),
  ];
}

function createPreviewCandidate(
  kind: "backup" | "primary",
  rank: number,
  candidate: GeneratedClipCandidate,
  transcriptResult: AnalysisTranscriptResult,
): AnalysisPreviewCandidateRecord {
  return {
    captionLines: deriveCaptionLines(
      candidate.startTime,
      candidate.endTime,
      transcriptResult.transcript.segments,
    ),
    captionPosition: { x: 0.5, y: 0.72 },
    captionStyle: "hormozi",
    captionsEnabled: true,
    crop: null,
    endTime: candidate.endTime,
    kind,
    previewFontSize: 48,
    rank,
    reason: candidate.reason,
    score: candidate.score,
    startTime: candidate.startTime,
    title: candidate.title,
  };
}

export function deriveCaptionLines(
  clipStart: number,
  clipEnd: number,
  segments: AnalysisTranscriptResult["transcript"]["segments"],
): CaptionLine[] {
  const overlapping = segments.filter(
    (segment) => segment.endSeconds > clipStart && segment.startSeconds < clipEnd,
  );
  const selected =
    overlapping.length > 0 ? overlapping : nearestSegment(clipStart, clipEnd, segments);
  const lines: CaptionLine[] = [];

  for (const segment of selected) {
    const words = segment.text.trim().split(/\s+/u).filter(Boolean);
    const chunks = chunkWords(words, 7);
    const segmentStart = Math.max(clipStart, segment.startSeconds);
    const segmentEnd = Math.min(clipEnd, segment.endSeconds);
    const safeStart = segmentEnd > segmentStart ? segmentStart : clipStart;
    const safeEnd = segmentEnd > segmentStart ? segmentEnd : clipEnd;
    const duration = safeEnd - safeStart;

    chunks.forEach((chunk, index) => {
      const startTime = safeStart + (duration * index) / chunks.length;
      const endTime = safeStart + (duration * (index + 1)) / chunks.length;
      lines.push({
        endTime: Math.min(clipEnd, endTime),
        startTime: Math.max(clipStart, startTime),
        text: chunk.join(" ").slice(0, 160),
      });
    });
  }

  return lines.slice(0, 200);
}

function nearestSegment(
  clipStart: number,
  clipEnd: number,
  segments: AnalysisTranscriptResult["transcript"]["segments"],
): AnalysisTranscriptResult["transcript"]["segments"] {
  const clipCenter = (clipStart + clipEnd) / 2;
  const nearest = [...segments].sort((left, right) => {
    const leftDistance = Math.abs((left.startSeconds + left.endSeconds) / 2 - clipCenter);
    const rightDistance = Math.abs((right.startSeconds + right.endSeconds) / 2 - clipCenter);
    return leftDistance - rightDistance;
  })[0];
  return nearest ? [nearest] : [];
}

function chunkWords(words: readonly string[], size: number): string[][] {
  const chunks: string[][] = [];
  for (let index = 0; index < words.length; index += size) {
    chunks.push(words.slice(index, index + size));
  }
  return chunks;
}
