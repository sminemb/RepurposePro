import { setTimeout as delay } from "node:timers/promises";
import type { ProcessingFailureCode } from "@repurposepro/shared";
import {
  ProcessingLeaseLostError,
  type ProcessingLeaseContext,
} from "./processing-lifecycle.service";

export type AnalysisStage = "transcription" | "selection";
export interface AnalysisAttempt {
  readonly outcome: "started" | "exhausted" | "lost";
  readonly attempt: number;
  readonly failureCode: ProcessingFailureCode | null;
}
export class AnalysisStageFailure extends Error {
  public constructor(public readonly code: ProcessingFailureCode) {
    super("Paid analysis exhausted its stage retry budget.");
    this.name = "AnalysisStageFailure";
  }
}

export function classifyAnalysisFailure(error: unknown): ProcessingFailureCode {
  if (error instanceof AnalysisStageFailure) return error.code;
  const failure = error as { name?: string; reason?: string } | null;
  if (
    failure?.reason === "storage_failed" ||
    failure?.name === "AnalysisTranscriptUnavailableError" ||
    failure?.name === "AnalysisPreviewFinalizationError"
  )
    return "STORAGE_FAILED";
  if (failure?.name === "WhisperTranscriptionError") return "WHISPER_FAILED";
  if (failure?.name === "TranscriptionAudioExtractionError") return "AUDIO_EXTRACTION_FAILED";
  if (
    failure?.name === "GeminiClipSelectionError" ||
    failure?.name === "GeminiSummarySelectionError"
  ) {
    return failure.reason === "request_failed" ? "GEMINI_FAILED" : "INVALID_AI_OUTPUT";
  }
  return "WORKER_PERMANENT_FAILURE";
}

export async function beginAnalysisAttempt(
  context: ProcessingLeaseContext,
  stage: AnalysisStage,
): Promise<number> {
  context.signal.throwIfAborted();
  const attempt = await context.beginAttempt!(stage);
  if (attempt.outcome === "lost") throw new ProcessingLeaseLostError();
  if (attempt.outcome === "exhausted") {
    throw new AnalysisStageFailure(attempt.failureCode ?? "ANALYSIS_RETRIES_EXHAUSTED");
  }
  return attempt.attempt;
}

export interface SelectionAttempts {
  begin(): Promise<number>;
  fail(code: ProcessingFailureCode): Promise<void>;
  wait(attempt: number): Promise<void>;
}
export function selectionAttempts(context: ProcessingLeaseContext): SelectionAttempts | undefined {
  if (!context.beginAttempt) return undefined;
  return {
    begin: () => beginAnalysisAttempt(context, "selection"),
    fail: (code) => context.recordAttemptFailure!("selection", code),
    wait: (attempt) => waitForAnalysisRetry(context.signal, attempt),
  };
}
export async function waitForAnalysisRetry(signal: AbortSignal, attempt: number): Promise<void> {
  signal.throwIfAborted();
  await delay(Math.min(attempt, 2) * 1_000, undefined, { signal });
  signal.throwIfAborted();
}
