export const ProjectOutputType = {
  Clips: "clips",
  Summary: "summary",
} as const;

export type ProjectOutputType = (typeof ProjectOutputType)[keyof typeof ProjectOutputType];

export const ProjectStatus = {
  Draft: "draft",
  Uploaded: "uploaded",
  WaitingForPayment: "waiting_for_payment",
  Queued: "queued",
  Transcribing: "transcribing",
  Analyzing: "analyzing",
  PreviewReady: "preview_ready",
  WaitingForUserEdits: "waiting_for_user_edits",
  Rendering: "rendering",
  Completed: "completed",
  Failed: "failed",
  Refunded: "refunded",
  Deleted: "deleted",
} as const;

export type ProjectStatus = (typeof ProjectStatus)[keyof typeof ProjectStatus];

export interface CreateProjectInput {
  readonly name: string;
  readonly outputType: ProjectOutputType;
}

export interface SourceVideoMetadata {
  readonly durationSeconds: number;
  readonly expiresAt: string;
  readonly fileName: string;
  readonly fileSizeBytes: number;
  readonly fps: number | null;
  readonly hasAudio: boolean;
  readonly height: number;
  readonly id: string;
  readonly requiredCredits: number;
  readonly width: number;
}

export interface ProjectSummary {
  readonly clipCount: number;
  readonly createdAt: string;
  readonly expiresAt: string | null;
  readonly id: string;
  readonly name: string;
  readonly outputType: ProjectOutputType;
  readonly status: ProjectStatus;
}

export interface ProjectListMeta {
  readonly nextCursor: string | null;
}

export interface ApiListSuccess<TData> {
  readonly data: readonly TData[];
  readonly meta: ProjectListMeta;
}

export function calculateRequiredCredits(durationSeconds: number): number {
  return Math.ceil(durationSeconds / 60);
}
