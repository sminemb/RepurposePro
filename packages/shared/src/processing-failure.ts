export const PROCESSING_FAILURES = {
  ANALYSIS_RETRIES_EXHAUSTED: {
    message: "Processing could not finish after automatic retries.",
    refundEligible: true,
  },
  AUDIO_EXTRACTION_FAILED: {
    message: "Processing failed while preparing the video's audio.",
    refundEligible: true,
  },
  FFMPEG_FAILED: {
    message: "Processing failed while preparing the video's audio.",
    refundEligible: true,
  },
  GEMINI_FAILED: {
    message: "Processing failed while analyzing the video's content.",
    refundEligible: true,
  },
  INVALID_AI_OUTPUT: {
    message: "Analysis could not produce a usable preview after automatic retries.",
    refundEligible: true,
  },
  STORAGE_FAILED: {
    message: "Processing could not read the source video or save its preview.",
    refundEligible: true,
  },
  USER_CANCELLED: {
    message: "Processing was cancelled.",
    refundEligible: false,
  },
  WHISPER_FAILED: {
    message: "Processing failed during transcription after automatic retries.",
    refundEligible: true,
  },
  WORKER_EXECUTION_LEASE_EXPIRED: {
    message: "Processing stopped unexpectedly and could not be recovered.",
    refundEligible: true,
  },
  WORKER_PERMANENT_FAILURE: {
    message: "Processing stopped before a usable preview could be saved.",
    refundEligible: true,
  },
} as const;

export type ProcessingFailureCode = keyof typeof PROCESSING_FAILURES;

export function isProcessingFailureCode(value: unknown): value is ProcessingFailureCode {
  return typeof value === "string" && Object.hasOwn(PROCESSING_FAILURES, value);
}

export interface ProcessingFailureSnapshot {
  readonly code: ProcessingFailureCode;
  readonly message: string;
  readonly refundStatus: "pending" | "completed" | "not_eligible";
  readonly refundedCredits: number;
  readonly refundCompletedAt: string | null;
}
