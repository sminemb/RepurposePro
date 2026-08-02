import "server-only";

import { projectClipListSchema, type ApiSuccess, type ProjectClipList } from "@repurposepro/shared";

import { requestApi } from "@/lib/server-api";

export type ProjectClipsResult =
  | { readonly clips: ProjectClipList; readonly kind: "success" }
  | { readonly kind: "unauthenticated" }
  | { readonly kind: "not_found" }
  | { readonly kind: "unavailable" };

export async function getProjectClips(projectId: string): Promise<ProjectClipsResult> {
  try {
    const response = await requestApi(`/projects/${encodeURIComponent(projectId)}/clips`);
    if (response.status === 401) return { kind: "unauthenticated" };
    if (response.status === 404) return { kind: "not_found" };
    if (!response.ok) return { kind: "unavailable" };
    const body = (await response.json()) as ApiSuccess<unknown>;
    const parsed = projectClipListSchema.safeParse(body.data);
    if (!parsed.success || parsed.data.projectId !== projectId) return { kind: "unavailable" };
    return { clips: parsed.data, kind: "success" };
  } catch (error: unknown) {
    console.error("Project clips request failed.", { error, projectId });
    return { kind: "unavailable" };
  }
}
