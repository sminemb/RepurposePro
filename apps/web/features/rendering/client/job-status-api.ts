export type RenderItemStatus = "queued" | "active" | "completed" | "failed";
export interface RenderClipStatus {
  clipId: string;
  title: string;
  status: RenderItemStatus;
  step: string;
  progress: number;
  errorCode?: string;
  errorMessage?: string;
  outputId?: string;
}
export interface RenderJobStatus {
  id: string;
  status: RenderItemStatus;
  step: string | null;
  progress: number;
  message: string | null;
  startedAt: string | null;
  completedAt: string | null;
  replacementClipId?: string;
  clips?: RenderClipStatus[];
}
const statuses = new Set<string>(["queued", "active", "completed", "failed"]);
const isUuid = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(value);
const nullableString = (value: unknown) => value === null || typeof value === "string";
const progressValue = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100;

export function parseRenderJobStatus(value: unknown, jobId: string): RenderJobStatus {
  if (typeof value !== "object" || value === null)
    throw new Error("The render status could not be verified.");
  const job = value as Partial<RenderJobStatus>;
  const invalid =
    job.id !== jobId ||
    !isUuid(job.id) ||
    !statuses.has(job.status ?? "") ||
    !nullableString(job.step) ||
    !progressValue(job.progress) ||
    !nullableString(job.message) ||
    !nullableString(job.startedAt) ||
    !nullableString(job.completedAt) ||
    (job.replacementClipId !== undefined && !isUuid(job.replacementClipId)) ||
    (job.clips !== undefined &&
      (!Array.isArray(job.clips) ||
        job.clips.some(
          (clip) =>
            !clip ||
            !isUuid(clip.clipId) ||
            typeof clip.title !== "string" ||
            !statuses.has(clip.status) ||
            typeof clip.step !== "string" ||
            !progressValue(clip.progress) ||
            (clip.errorCode !== undefined && typeof clip.errorCode !== "string") ||
            (clip.errorMessage !== undefined && typeof clip.errorMessage !== "string") ||
            (clip.outputId !== undefined && !isUuid(clip.outputId)),
        )));
  if (invalid) throw new Error("The render status could not be verified.");
  return job as RenderJobStatus;
}

export async function loadRenderJobStatus(
  apiUrl: string,
  jobId: string,
  signal: AbortSignal,
): Promise<RenderJobStatus> {
  const response = await fetch(
    `${apiUrl.replace(/\/$/u, "")}/jobs/${encodeURIComponent(jobId)}/status`,
    {
      credentials: "include",
      cache: "no-store",
      signal,
    },
  );
  if (!response.ok) throw new Error("Live render updates are unavailable. We will keep trying.");
  const body = (await response.json().catch(() => null)) as { data?: unknown } | null;
  return parseRenderJobStatus(body?.data, jobId);
}
