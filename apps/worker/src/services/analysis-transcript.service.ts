import { dirname, join } from "node:path";

import { Inject } from "@nestjs/common";

import {
  beginAnalysisAttempt,
  classifyAnalysisFailure,
  waitForAnalysisRetry,
} from "./analysis-retry";
import type { ProcessingLeaseContext } from "./processing-lifecycle.service";
import { ProcessingLeaseLostError } from "./processing-lifecycle.service";
import {
  ANALYSIS_TRANSCRIPT_REPOSITORY,
  type AnalysisTranscriptRepositoryContract,
  type AnalysisTranscriptionContext,
  type PersistedTranscript,
} from "./analysis-transcript.repository";
import { TranscriptionAudioExtractor } from "./transcription-audio-extractor.service";
import { type TimestampedTranscript, WhisperTranscriber } from "./whisper-transcriber.service";

const durationToleranceSeconds = 0.25;

export interface AnalysisTranscriptResult {
  readonly sourceDurationSeconds: number;
  readonly transcript: PersistedTranscript;
}

export class AnalysisTranscriptUnavailableError extends Error {
  public constructor() {
    super("Analysis transcript source is unavailable.");
    this.name = "AnalysisTranscriptUnavailableError";
  }
}

export class AnalysisTranscriptService {
  public constructor(
    @Inject(ANALYSIS_TRANSCRIPT_REPOSITORY)
    private readonly repository: AnalysisTranscriptRepositoryContract,
    private readonly extractor: TranscriptionAudioExtractor,
    private readonly transcriber: WhisperTranscriber,
    private readonly model: string,
  ) {}

  public async getOrCreate(
    jobId: string,
    context: ProcessingLeaseContext,
  ): Promise<AnalysisTranscriptResult> {
    let transcriptionContext = await this.repository.loadContext(
      jobId,
      context.workerId,
      context.leaseToken,
    );
    if (transcriptionContext.outcome === "lost") {
      throw new ProcessingLeaseLostError();
    }
    if (transcriptionContext.outcome === "rejected") {
      throw new AnalysisTranscriptUnavailableError();
    }
    if (transcriptionContext.outcome === "transcript_ready") {
      return {
        sourceDurationSeconds: transcriptionContext.sourceDurationSeconds,
        transcript: transcriptionContext.transcript,
      };
    }

    for (;;) {
      const attempt = context.beginAttempt
        ? await beginAnalysisAttempt(context, "transcription")
        : 1;
      try {
        return await this.transcribeAndPersist(jobId, context, transcriptionContext, attempt);
      } catch (error: unknown) {
        if (
          context.signal.aborted ||
          error instanceof ProcessingLeaseLostError ||
          !context.beginAttempt
        )
          throw error;
        await context.recordAttemptFailure!("transcription", classifyAnalysisFailure(error));
        // A lost persistence response must not repeat already completed transcription.
        transcriptionContext = await this.repository.loadContext(
          jobId,
          context.workerId,
          context.leaseToken,
        );
        if (transcriptionContext.outcome === "lost") throw new ProcessingLeaseLostError();
        if (transcriptionContext.outcome === "rejected")
          throw new AnalysisTranscriptUnavailableError();
        if (transcriptionContext.outcome === "transcript_ready")
          return {
            sourceDurationSeconds: transcriptionContext.sourceDurationSeconds,
            transcript: transcriptionContext.transcript,
          };
        if (attempt >= 2) throw error;
        await waitForAnalysisRetry(context.signal, attempt);
      }
    }
  }

  private async transcribeAndPersist(
    jobId: string,
    context: ProcessingLeaseContext,
    transcriptionContext: Extract<AnalysisTranscriptionContext, { outcome: "ready" }>,
    attempt: number,
  ): Promise<AnalysisTranscriptResult> {
    const audioPath = join(
      dirname(transcriptionContext.sourcePath),
      ".analysis",
      `${jobId}-${context.leaseToken}-${attempt}.wav`,
    );
    try {
      await this.repository.registerTemporary?.(jobId, context.leaseToken, audioPath);
      await context.updateProgress("extracting_audio", 25);
      await this.extractor.extract({
        destinationPath: audioPath,
        registerTemporary: this.repository.registerTemporary
          ? (path) => this.repository.registerTemporary!(jobId, context.leaseToken, path)
          : undefined,
        signal: context.signal,
        sourcePath: transcriptionContext.sourcePath,
      });
      await context.updateProgress("transcribing", 45);
      const transcript = await this.transcriber.transcribe({
        audioPath,
        signal: context.signal,
      });
      if (
        transcript.durationSeconds >
        transcriptionContext.sourceDurationSeconds + durationToleranceSeconds
      ) {
        throw new AnalysisTranscriptUnavailableError();
      }
      const normalizedTranscript = normalizeTranscriptDuration(
        transcript,
        transcriptionContext.sourceDurationSeconds,
      );
      const persisted = await this.repository
        .persist(jobId, context.workerId, context.leaseToken, this.model, normalizedTranscript)
        .catch(() => {
          throw new AnalysisTranscriptUnavailableError();
        });
      if (persisted.outcome === "lost") {
        throw new ProcessingLeaseLostError();
      }
      if (persisted.outcome === "rejected") {
        throw new AnalysisTranscriptUnavailableError();
      }
      if (persisted.outcome === "reused") {
        const durable = await this.repository.loadContext(
          jobId,
          context.workerId,
          context.leaseToken,
        );
        if (durable.outcome !== "transcript_ready") {
          throw new AnalysisTranscriptUnavailableError();
        }
        return {
          sourceDurationSeconds: durable.sourceDurationSeconds,
          transcript: durable.transcript,
        };
      }
      return {
        sourceDurationSeconds: transcriptionContext.sourceDurationSeconds,
        transcript: { ...normalizedTranscript, id: persisted.transcriptId, model: this.model },
      };
    } finally {
      await this.extractor.discard(audioPath).catch(() => undefined);
    }
  }
}

function normalizeTranscriptDuration(
  transcript: TimestampedTranscript,
  sourceDurationSeconds: number,
): TimestampedTranscript {
  if (transcript.durationSeconds <= sourceDurationSeconds) return transcript;

  return {
    ...transcript,
    durationSeconds: sourceDurationSeconds,
    segments: transcript.segments
      .filter((segment) => segment.startSeconds < sourceDurationSeconds)
      .map((segment, sequence) => ({
        ...segment,
        endSeconds: Math.min(segment.endSeconds, sourceDurationSeconds),
        sequence,
      })),
  };
}
