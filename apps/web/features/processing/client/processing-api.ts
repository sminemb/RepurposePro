import type { ApiError, ApiSuccess, ProcessingStartResult } from "@repurposepro/shared";

interface StartProcessingInput {
  readonly apiUrl: string;
  readonly projectId: string;
}

export class ProcessingRequestError extends Error {
  public constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ProcessingRequestError";
  }
}

export function createProcessingStartEndpoint(apiUrl: string, projectId: string): string {
  return `${apiUrl.replace(/\/$/, "")}/projects/${encodeURIComponent(projectId)}/analyze`;
}

export async function startProcessing({
  apiUrl,
  projectId,
}: StartProcessingInput): Promise<ProcessingStartResult> {
  let response: Response;

  try {
    response = await fetch(createProcessingStartEndpoint(apiUrl, projectId), {
      body: JSON.stringify({ confirmed: true }),
      credentials: "include",
      headers: { "content-type": "application/json" },
      method: "POST",
    });
  } catch {
    throw new ProcessingRequestError(
      "NETWORK_ERROR",
      "RepurposePro is unreachable. Check your connection and try again.",
    );
  }

  const body = (await response.json().catch(() => null)) as ApiError | ApiSuccess<unknown> | null;

  if (!response.ok) {
    const error = body && "error" in body ? body.error : null;
    throw new ProcessingRequestError(
      error?.code ?? "PROCESSING_START_FAILED",
      error?.message ?? "We could not start processing. Try again.",
    );
  }

  const data = body && "data" in body ? body.data : null;
  if (response.status !== 202 || !isProcessingStartResult(data, projectId)) {
    throw new ProcessingRequestError(
      "PROCESSING_RESPONSE_INVALID",
      "Processing returned an unexpected response. Try again.",
    );
  }

  return data;
}

function isProcessingStartResult(
  value: unknown,
  projectId: string,
): value is ProcessingStartResult {
  if (typeof value !== "object" || value === null) return false;

  const result = value as Partial<ProcessingStartResult>;
  return (
    Number.isSafeInteger(result.creditsCharged) &&
    (result.creditsCharged ?? -1) >= 0 &&
    typeof result.jobId === "string" &&
    result.jobId.length > 0 &&
    result.projectId === projectId &&
    (result.status === "queued" || result.status === "active")
  );
}
