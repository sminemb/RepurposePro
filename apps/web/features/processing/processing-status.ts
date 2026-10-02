import {
  isProcessingFailureCode,
  type ProcessingFailureSnapshot,
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
    (snapshot.outputType === undefined ||
      snapshot.outputType === "clips" ||
      snapshot.outputType === "summary") &&
    typeof snapshot.status === "string" &&
    projectStatuses.has(snapshot.status) &&
    (snapshot.currentJob === null || isProcessingJobSnapshot(snapshot.currentJob))
  );
}

export function isPreviewReady(snapshot: ProjectProcessingStatus): boolean {
  if (snapshot.currentJob?.failure) return false;
  return (
    snapshot.status === ProjectStatus.PreviewReady ||
    snapshot.currentJob?.step === ProcessingJobStep.PreviewReady
  );
}

export function isTerminalProcessingStatus(snapshot: ProjectProcessingStatus): boolean {
  if (snapshot.currentJob?.failure?.refundStatus === "pending") return false;
  return (
    terminalProjectStatuses.has(snapshot.status) ||
    (snapshot.currentJob !== null && terminalJobStatuses.has(snapshot.currentJob.status))
  );
}

function isProcessingJobSnapshot(value: unknown): value is ProcessingJobSnapshot {
  if (typeof value !== "object" || value === null) return false;

  const job = value as Partial<ProcessingJobSnapshot>;
  const progress = job.progress;
  return (
    typeof job.id === "string" &&
    job.id.length > 0 &&
    typeof job.status === "string" &&
    processingStatuses.has(job.status) &&
    (job.failure === undefined || job.failure === null || isFailure(job.failure)) &&
    (job.step === null || (typeof job.step === "string" && processingSteps.has(job.step))) &&
    (progress === null ||
      (progress !== undefined && Number.isInteger(progress) && progress >= 0 && progress <= 100))
  );
}

function isFailure(value: unknown): value is ProcessingFailureSnapshot {
  if (typeof value !== "object" || value === null) return false;
  const failure = value as Partial<ProcessingFailureSnapshot>;
  if (
    !isProcessingFailureCode(failure.code) ||
    typeof failure.message !== "string" ||
    !failure.message.trim() ||
    failure.message.length > 500 ||
    !Number.isSafeInteger(failure.refundedCredits)
  )
    return false;
  if (failure.refundStatus === "completed")
    return (
      failure.refundedCredits! > 0 &&
      typeof failure.refundCompletedAt === "string" &&
      Number.isFinite(Date.parse(failure.refundCompletedAt))
    );
  return (
    (failure.refundStatus === "pending" || failure.refundStatus === "not_eligible") &&
    failure.refundedCredits === 0 &&
    failure.refundCompletedAt === null
  );
}
