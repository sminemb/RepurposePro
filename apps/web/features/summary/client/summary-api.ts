import { summaryStateSchema, renderStartSchema, type SummaryEdit } from "@repurposepro/shared";
export async function summaryRequest(apiUrl: string, projectId: string, input?: SummaryEdit) {
  const response = await fetch(
    `${apiUrl.replace(/\/$/, "")}/projects/${encodeURIComponent(projectId)}/summary`,
    {
      method: input ? "PATCH" : "GET",
      credentials: "include",
      cache: "no-store",
      headers: input ? { "Content-Type": "application/json" } : undefined,
      body: input ? JSON.stringify(input) : undefined,
      signal: AbortSignal.timeout(15000),
    },
  );
  const body = (await response.json().catch(() => null)) as {
    data?: unknown;
    error?: { message?: string };
  } | null;
  if (!response.ok)
    throw new Error(body?.error?.message ?? "The summary could not be loaded or saved. Try again.");
  return summaryStateSchema.parse(body?.data);
}
export async function renderSummary(
  apiUrl: string,
  projectId: string,
  revision: number,
  key: string,
) {
  const response = await fetch(
    `${apiUrl.replace(/\/$/, "")}/projects/${encodeURIComponent(projectId)}/render`,
    {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", "Idempotency-Key": key },
      body: JSON.stringify({ type: "summary", expectedRevision: revision }),
      signal: AbortSignal.timeout(15000),
    },
  );
  const body = (await response.json().catch(() => null)) as {
    data?: unknown;
    error?: { message?: string };
  } | null;
  if (!response.ok)
    throw new Error(body?.error?.message ?? "Your summary could not start rendering. Try again.");
  return renderStartSchema.parse(body?.data);
}
