import { clipEditorSchema, type ClipEditor, type ClipEditInput } from "@repurposepro/shared";

export async function requestClipEditor(
  apiUrl: string,
  projectId: string,
  clipId: string,
  input?: ClipEditInput,
  signal?: AbortSignal,
): Promise<ClipEditor> {
  const response = await fetch(
    `${apiUrl.replace(/\/$/u, "")}/projects/${encodeURIComponent(projectId)}/clips/${encodeURIComponent(clipId)}`,
    {
      method: input ? "PATCH" : "GET",
      credentials: "include",
      cache: "no-store",
      signal,
      ...(input
        ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) }
        : {}),
    },
  ).catch((error: unknown) => {
    if (signal?.aborted) throw error;
    throw new Error(
      "Could not connect to RepurposePro. Check your connection and try again; your edits are still here.",
    );
  });
  if (!response.ok) {
    const messages: Record<number, string> = {
      401: "Your session has expired. Keep this tab open and sign in again before saving.",
      404: "This clip is no longer available. Your edits have been kept in this tab.",
      409: "This clip was changed elsewhere. Reload the saved version before applying your edits again.",
      400: "Check your trim and caption settings, then try again.",
    };
    throw new Error(
      messages[response.status] ??
        "Could not save or load this clip. Your edits are still here. Please try again.",
    );
  }
  const body = (await response.json()) as { data?: unknown };
  const editor = clipEditorSchema.parse(body.data);
  if (editor.clip.id !== clipId)
    throw new Error("The server returned a different clip. Please reload.");
  return editor;
}
