import {
  ProcessingJobStatus,
  ProcessingJobStep,
  ProjectStatus,
  type ProcessingJobSnapshot,
  type ProjectProcessingStatus,
} from "@repurposepro/shared";

const projectStatuses = new Set<string>(Object.values(ProjectStatus));
const processingStatuses = new Set<string>(Object.values(ProcessingJobStatus));
const processingSteps = new Set<string>(Object.values(ProcessingJobStep));
const terminalProjectStatuses = new Set<string>([
  ProjectStatus.Completed,
  ProjectStatus.Deleted,
  ProjectStatus.Failed,
  ProjectStatus.PreviewReady,
  ProjectStatus.Refunded,
  ProjectStatus.WaitingForUserEdits,
]);
const terminalJobStatuses = new Set<string>([
  ProcessingJobStatus.Cancelled,
  ProcessingJobStatus.Completed,
  ProcessingJobStatus.Failed,
  ProcessingJobStatus.Refunded,
]);

export function isProjectProcessingStatus(
  value: unknown,
  expectedProjectId: string,
): value is ProjectProcessingStatus {
  if (typeof value !== "object" || value === null) return false;

  const snapshot = value as Partial<ProjectProcessingStatus>;
  return (
    snapshot.projectId === expectedProjectId &&
    typeof snapshot.status === "string" &&
    projectStatuses.has(snapshot.status) &&
    (snapshot.currentJob === null || isProcessingJobSnapshot(snapshot.currentJob))
  );
}

export function isPreviewReady(snapshot: ProjectProcessingStatus): boolean {
  return (
    snapshot.status === ProjectStatus.PreviewReady ||
    snapshot.currentJob?.step === ProcessingJobStep.PreviewReady
  );
}

export function isTerminalProcessingStatus(snapshot: ProjectProcessingStatus): boolean {
  return (
    terminalProjectStatuses.has(snapshot.status) ||
    (snapshot.currentJob !== null && terminalJobStatuses.has(snapshot.currentJob.status))
  );
}

function isProcessingJobSnapshot(value: unknown): value is ProcessingJobSnapshot {
  if (typeof value !== "object" || value === null) return false;

  const job = value as Partial<ProcessingJobSnapshot>;
  return (
    typeof job.id === "string" &&
    job.id.length > 0 &&
    typeof job.status === "string" &&
    processingStatuses.has(job.status) &&
    (job.step === null || (typeof job.step === "string" && processingSteps.has(job.step))) &&
    (job.progress === null ||
      (Number.isInteger(job.progress) && (job.progress ?? -1) >= 0 && (job.progress ?? 101) <= 100))
  );
}
