export const ProcessingJobStatus = {
  Active: "active",
  Cancelled: "cancelled",
  Completed: "completed",
  Failed: "failed",
  Queued: "queued",
  Refunded: "refunded",
} as const;

export type ProcessingJobStatus = (typeof ProcessingJobStatus)[keyof typeof ProcessingJobStatus];

export interface ProcessingStartResult {
  readonly creditsCharged: number;
  readonly jobId: string;
  readonly projectId: string;
  readonly status: ProcessingJobStatus;
}
