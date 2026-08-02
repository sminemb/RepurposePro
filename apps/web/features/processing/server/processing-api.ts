import "server-only";

import { type ApiSuccess, type ProjectProcessingStatus } from "@repurposepro/shared";

import { requestApi } from "@/lib/server-api";

import { isProjectProcessingStatus } from "../processing-status";

export type ProjectProcessingStatusResult =
  | { readonly kind: "success"; readonly snapshot: ProjectProcessingStatus }
  | { readonly kind: "unauthenticated" }
  | { readonly kind: "not_found" }
  | { readonly kind: "unavailable"; readonly message: string };

const unavailableMessage = "We could not load this project's processing status. Try again.";

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
