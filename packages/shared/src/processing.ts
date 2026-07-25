import type { ProjectStatus } from "./projects";

export const ProcessingJobStatus = {
  Active: "active",
  Cancelled: "cancelled",
  Completed: "completed",
  Failed: "failed",
  Queued: "queued",
  Refunded: "refunded",
} as const;

export type ProcessingJobStatus = (typeof ProcessingJobStatus)[keyof typeof ProcessingJobStatus];

export const ProcessingJobStep = {
  Analyzing: "analyzing",
  Completed: "completed",
  ExtractingAudio: "extracting_audio",
  Failed: "failed",
  GeneratingPreview: "generating_preview",
  Preparing: "preparing",
  PreviewReady: "preview_ready",
  Queued: "queued",
  Rendering: "rendering",
  SavingOutput: "saving_output",
  Transcribing: "transcribing",
} as const;

export type ProcessingJobStep = (typeof ProcessingJobStep)[keyof typeof ProcessingJobStep];

export interface ProcessingJobSnapshot {
  readonly id: string;
  readonly progress: number | null;
  readonly status: ProcessingJobStatus;
  readonly step: ProcessingJobStep | null;
}

export interface ProjectProcessingStatus {
  readonly currentJob: ProcessingJobSnapshot | null;
  readonly projectId: string;
  readonly status: ProjectStatus;
}

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
