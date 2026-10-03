import { protectionRetryMessage } from "@repurposepro/shared";
import { renderStartSchema, type RenderClipInput } from "@repurposepro/shared";
export async function startClipRender(
  apiUrl: string,
  projectId: string,
  input: RenderClipInput,
  key: string,
) {
  const response = await fetch(
    `${apiUrl.replace(/\/$/u, "")}/projects/${encodeURIComponent(projectId)}/render`,
    {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      headers: { "Content-Type": "application/json", "Idempotency-Key": key },
      body: JSON.stringify(input),
    },
  );
  const body = (await response.json().catch(() => null)) as {
    data?: unknown;
    error?: { message?: string; code?: string };
  } | null;
  if (!response.ok)
    throw new Error(
      protectionRetryMessage(body?.error?.code, "Rendering", response.headers.get("retry-after")) ??
        body?.error?.message ??
        "Could not start the render. Your saved edits are safe; try again.",
    );
  return renderStartSchema.parse(body?.data);
}
