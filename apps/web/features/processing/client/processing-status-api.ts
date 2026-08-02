import type { ApiSuccess, ProjectProcessingStatus } from "@repurposepro/shared";

import { isProjectProcessingStatus } from "../processing-status";

export class ProcessingStatusRequestError extends Error {
  public constructor(message = "We could not refresh processing status.") {
    super(message);
    this.name = "ProcessingStatusRequestError";
  }
}

export function createProcessingStatusEndpoint(apiUrl: string, projectId: string): string {
  return `${apiUrl.replace(/\/$/u, "")}/projects/${encodeURIComponent(projectId)}/status`;
}

export async function loadProcessingStatus(
  apiUrl: string,
  projectId: string,
  signal: AbortSignal,
): Promise<ProjectProcessingStatus> {
  let response: Response;
  try {
    response = await fetch(createProcessingStatusEndpoint(apiUrl, projectId), {
      cache: "no-store",
      credentials: "include",
      signal,
    });
  } catch (error: unknown) {
    if (signal.aborted) throw signal.reason ?? error;
    throw new ProcessingStatusRequestError();
  }

  if (!response.ok) throw new ProcessingStatusRequestError();
  const body = (await response.json().catch(() => null)) as ApiSuccess<unknown> | null;
  const snapshot = body && "data" in body ? body.data : null;
  if (!isProjectProcessingStatus(snapshot, projectId)) {
    throw new ProcessingStatusRequestError();
  }
  return snapshot;
}
