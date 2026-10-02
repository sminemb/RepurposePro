import { clipPreviewCandidateSchema, clipRegenerationResultSchema } from "@repurposepro/shared";

export async function mutateClip(
  apiUrl: string,
  projectId: string,
  clipId: string,
  action: "selection" | "regenerate" | "delete",
  body: unknown,
  key?: string,
) {
  const response = await fetch(
    `${apiUrl.replace(/\/$/u, "")}/projects/${encodeURIComponent(projectId)}/clips/${encodeURIComponent(clipId)}${action === "delete" ? "" : `/${action}`}`,
    {
      method: action === "delete" ? "DELETE" : action === "selection" ? "PATCH" : "POST",
      credentials: "include",
      cache: "no-store",
      headers: { "Content-Type": "application/json", ...(key ? { "Idempotency-Key": key } : {}) },
      body: JSON.stringify(body),
    },
  );
  if (!response.ok) {
    const error = (await response.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    throw new Error(error?.error?.message ?? "Could not update this clip. Please try again.");
  }
  return response.status === 204 ? null : ((await response.json()) as { data: unknown }).data;
}
export async function selectClip(
  apiUrl: string,
  projectId: string,
  clipId: string,
  selected: boolean,
) {
  const clip = clipPreviewCandidateSchema.parse(
    await mutateClip(apiUrl, projectId, clipId, "selection", { selected }),
  );
  if (clip.id !== clipId)
    throw new Error("The server returned a different clip. Reload this page.");
  return clip;
}
export async function regenerateClip(
  apiUrl: string,
  projectId: string,
  clipId: string,
  expectedRevision: number,
  key: string,
) {
  return clipRegenerationResultSchema.parse(
    await mutateClip(apiUrl, projectId, clipId, "regenerate", { expectedRevision }, key),
  );
}

export async function deleteClip(
  apiUrl: string,
  projectId: string,
  clipId: string,
  expectedRevision: number,
): Promise<void> {
  await mutateClip(apiUrl, projectId, clipId, "delete", { expectedRevision });
}
