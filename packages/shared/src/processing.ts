export const ProcessingJobStatus = {
  Active: "active",
  Cancelled: "cancelled",
  Completed: "completed",
  Failed: "failed",
  Queued: "queued",
  Refunded: "refunded",
} as const;

export type ProcessingJobStatus = (typeof ProcessingJobStatus)[keyof typeof ProcessingJobStatus];

export const VIDEO_ANALYSIS_QUEUE_NAME = "video-analysis-queue";
export const ANALYZE_VIDEO_JOB_NAME = "analyze_video";

export interface VideoAnalysisJobPayload {
  readonly jobId: string;
  readonly projectId: string;
}

export interface ProcessingStartResult {
  readonly creditsCharged: number;
  readonly jobId: string;
  readonly projectId: string;
  readonly status: ProcessingJobStatus;
}
