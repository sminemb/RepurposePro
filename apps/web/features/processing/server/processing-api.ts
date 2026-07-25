import "server-only";

import {
  ProcessingJobStatus,
  ProcessingJobStep,
  ProjectStatus,
  type ApiSuccess,
  type ProcessingJobSnapshot,
  type ProjectProcessingStatus,
} from "@repurposepro/shared";

import { requestApi } from "@/lib/server-api";

export type ProjectProcessingStatusResult =
  | { readonly kind: "success"; readonly snapshot: ProjectProcessingStatus }
  | { readonly kind: "unauthenticated" }
  | { readonly kind: "not_found" }
  | { readonly kind: "unavailable"; readonly message: string };

const unavailableMessage = "We could not load this project's processing status. Try again.";
const projectStatuses = new Set<string>(Object.values(ProjectStatus));
const processingStatuses = new Set<string>(Object.values(ProcessingJobStatus));
const processingSteps = new Set<string>(Object.values(ProcessingJobStep));

export async function getProjectProcessingStatus(
  projectId: string,
): Promise<ProjectProcessingStatusResult> {
  try {
    const response = await requestApi(`/projects/${encodeURIComponent(projectId)}/status`);

    if (response.status === 401) return { kind: "unauthenticated" };
    if (response.status === 404) return { kind: "not_found" };
    if (!response.ok) return { kind: "unavailable", message: unavailableMessage };

    const body = (await response.json()) as ApiSuccess<unknown>;
    if (!isProjectProcessingStatus(body.data, projectId)) {
      return { kind: "unavailable", message: unavailableMessage };
    }

    return { kind: "success", snapshot: body.data };
  } catch {
    return { kind: "unavailable", message: unavailableMessage };
  }
}

function isProjectProcessingStatus(
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
