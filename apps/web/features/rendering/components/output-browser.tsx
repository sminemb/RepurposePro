"use client";
import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import {
  projectClipListSchema,
  outputListSchema,
  renderStartSchema,
  type OutputMetadata,
  type ProjectProcessingStatus,
} from "@repurposepro/shared";
import { loadProcessingStatus } from "@/features/processing/client/processing-status-api";
import { loadRenderJobStatus, type RenderJobStatus } from "../client/job-status-api";

const steps: Record<string, string> = {
  queued: "Queued",
  preparing: "Preparing",
  rendering: "Rendering",
  saving: "Saving",
  saving_output: "Saving",
  completed: "Completed",
  failed: "Failed",
};

export function OutputBrowser({ apiUrl, projectId }: { apiUrl: string; projectId: string }) {
  const base = apiUrl.replace(/\/$/u, "");
  const [outputs, setOutputs] = useState<OutputMetadata[]>([]);
  const [snapshot, setSnapshot] = useState<ProjectProcessingStatus | null>(null);
  const [renderJob, setRenderJob] = useState<RenderJobStatus | null>(null);
  const [error, setError] = useState("");
  const [retryError, setRetryError] = useState("");
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const retryAttempt = useRef<{ signature: string; key: string } | null>(null);

  useEffect(() => {
    let stopped = false;
    let generation = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | undefined;
    const refresh = async () => {
      if (stopped || document.visibilityState === "hidden") return;
      const currentGeneration = ++generation;
      const request = new AbortController();
      controller = request;
      const deadline = setTimeout(() => {
        request.abort();
        if (!stopped && generation === currentGeneration) {
          setLoading(false);
          setError("Live updates timed out. We will keep trying.");
        }
      }, 15_000);
      let active = false;
      try {
        const results = await Promise.allSettled([
          loadProcessingStatus(apiUrl, projectId, request.signal),
          fetch(`${base}/projects/${encodeURIComponent(projectId)}/outputs`, {
            credentials: "include",
            cache: "no-store",
            signal: request.signal,
          }).then(async (response) => {
            if (!response.ok)
              throw new Error(
                response.status === 401
                  ? "Sign in again to view your exports."
                  : "Exports are temporarily unavailable. We will keep trying.",
              );
            const body = (await response.json().catch(() => null)) as { data: unknown } | null;
            const parsed = outputListSchema.safeParse(body?.data);
            if (!parsed.success)
              throw new Error("Your exports could not be refreshed. We will keep trying.");
            return parsed.data;
          }),
        ]);
        if (stopped || generation !== currentGeneration || request.signal.aborted) return;
        const [statusResult, outputResult] = results;
        if (outputResult.status === "fulfilled") setOutputs(outputResult.value);
        setLoading(false);
        if (statusResult.status === "fulfilled") {
          const next = statusResult.value;
          setSnapshot(next);
          active = next.currentJob?.status === "queued" || next.currentJob?.status === "active";
          if (next.currentJob) {
            const detail = await loadRenderJobStatus(apiUrl, next.currentJob.id, request.signal);
            if (stopped || generation !== currentGeneration || request.signal.aborted) return;
            setRenderJob(detail);
          } else setRenderJob(null);
        }
        if (outputResult.status === "rejected")
          setError(
            outputResult.reason instanceof Error && !(outputResult.reason instanceof TypeError)
              ? outputResult.reason.message
              : "Exports are temporarily unavailable.",
          );
        else if (statusResult.status === "rejected")
          setError("Live updates are temporarily unavailable. We will keep trying.");
        else setError("");
      } catch (failure) {
        if (!stopped && generation === currentGeneration && !request.signal.aborted) {
          setLoading(false);
          setError(failure instanceof Error ? failure.message : "Exports unavailable.");
        }
      } finally {
        clearTimeout(deadline);
        if (
          !stopped &&
          generation === currentGeneration &&
          (document.visibilityState as DocumentVisibilityState) !== "hidden"
        )
          timer = setTimeout(() => void refresh(), active ? 3_000 : 15_000);
      }
    };
    const resume = () => {
      generation += 1;
      if (timer) clearTimeout(timer);
      controller?.abort();
      if (document.visibilityState !== "hidden") void refresh();
    };
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("online", resume);
    void refresh();
    return () => {
      stopped = true;
      generation += 1;
      if (timer) clearTimeout(timer);
      controller?.abort();
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("online", resume);
    };
  }, [apiUrl, base, projectId, refreshVersion]);

  const job =
    renderJob?.clips !== undefined && renderJob.id === snapshot?.currentJob?.id
      ? snapshot.currentJob
      : null;
  const detail = renderJob?.id === job?.id ? renderJob : null;
  const active = job?.status === "queued" || job?.status === "active";
  const failed = job?.status === "failed";
  const clipResults = detail?.clips ?? [];
  const completed = clipResults.filter((clip) => clip.status === "completed").length;
  const failedClips = clipResults.filter((clip) => clip.status === "failed");
  const groups = new Map<string, OutputMetadata[]>();
  for (const output of outputs) {
    const group = groups.get(output.renderJobId) ?? [];
    group.push(output);
    groups.set(output.renderJobId, group);
  }
  const outputGroups = [...groups.entries()].sort(
    ([, first], [, second]) => Date.parse(second[0]!.createdAt) - Date.parse(first[0]!.createdAt),
  );

  const retryFailed = async () => {
    if (retrying || active || !failedClips.length) return;
    setRetrying(true);
    setRetryError("");
    try {
      const response = await fetch(`${base}/projects/${encodeURIComponent(projectId)}/clips`, {
        credentials: "include",
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Could not check your selected clips. Please try again.");
      const body = (await response.json().catch(() => null)) as { data: unknown } | null;
      const parsedClips = projectClipListSchema.safeParse(body?.data);
      if (!parsedClips.success)
        throw new Error("Could not check your selected clips. Please try again.");
      const candidates = parsedClips.data.clips;
      const failedIds = new Set(failedClips.map((clip) => clip.clipId));
      const selected = candidates.filter(
        (clip) => clip.selected !== false && failedIds.has(clip.id),
      );
      if (!selected.length)
        throw new Error(
          "No failed clips are still selected. Select clips in the editor to render again.",
        );
      const input = {
        type: "clips",
        clipIds: selected.map((clip) => clip.id),
        expectedRevisions: Object.fromEntries(
          selected.map((clip) => [clip.id, clip.revision ?? 0]),
        ),
      };
      const signature = JSON.stringify({ jobId: job?.id, ...input });
      if (retryAttempt.current?.signature !== signature)
        retryAttempt.current = { signature, key: crypto.randomUUID() };
      const started = await fetch(`${base}/projects/${encodeURIComponent(projectId)}/render`, {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": retryAttempt.current.key,
        },
        body: JSON.stringify(input),
      });
      const result = (await started.json().catch(() => null)) as {
        data?: unknown;
        error?: { message?: string };
      } | null;
      if (!started.ok) throw new Error(result?.error?.message ?? "Could not retry these clips.");
      if (!renderStartSchema.safeParse(result?.data).success)
        throw new Error("Could not confirm your retry. Refresh to check its progress.");
      setRenderJob(null);
      retryAttempt.current = null;
      setRefreshVersion((value) => value + 1);
    } catch (failure) {
      setRetryError(failure instanceof Error ? failure.message : "Could not retry these clips.");
    } finally {
      setRetrying(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-rp-text-muted">
          Your exported clips stay available until the expiration shown below.
        </p>
        <Link
          className="inline-flex min-h-11 items-center rounded-rp-md border border-rp-border px-4 text-sm text-rp-text"
          href={`/projects/${encodeURIComponent(projectId)}/clips`}
        >
          Return to clip editor
        </Link>
      </div>
      {job && (active || clipResults.length > 0) ? (
        <section
          aria-live="polite"
          className="rounded-rp-lg border border-rp-border bg-rp-surface p-6"
        >
          <h2 className="font-semibold text-rp-text">
            {active
              ? "Rendering your selected clips"
              : failed
                ? completed
                  ? "Some clips could not be exported"
                  : "Your clips could not be exported"
                : "Your clips are ready"}
          </h2>
          <p className="mt-2 text-sm text-rp-text-muted">
            {clipResults.length
              ? `${completed} of ${clipResults.length} clips completed.`
              : "Preparing your saved clips."}{" "}
            {failedClips.length ? `${failedClips.length} failed. ` : ""}
            {active
              ? "Downloads appear as each clip finishes. You can leave this page and return later."
              : completed
                ? "Successful downloads remain available below."
                : "Your saved edits are ready for another attempt."}
          </p>
          {active ? (
            <div
              role="progressbar"
              aria-label="Batch render progress"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={detail?.progress ?? job.progress ?? 0}
              className="mt-4 h-2 overflow-hidden rounded-full bg-rp-border"
            >
              <div
                className="h-full bg-rp-primary"
                style={{ width: `${detail?.progress ?? job.progress ?? 0}%` }}
              />
            </div>
          ) : null}
          <ul className="mt-4 space-y-3">
            {clipResults.map((clip) => (
              <li key={clip.clipId} className="rounded-rp-md border border-rp-border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium text-rp-text">{clip.title}</span>
                  <span
                    className={
                      clip.status === "failed"
                        ? "text-sm text-rp-danger"
                        : "text-sm text-rp-text-muted"
                    }
                  >
                    {steps[
                      clip.status === "completed" || clip.status === "failed"
                        ? clip.status
                        : clip.step
                    ] ?? "Preparing"}
                    {clip.status === "active" ? ` · ${clip.progress}%` : ""}
                  </span>
                </div>
                {clip.status === "failed" ? (
                  <p className="mt-2 text-sm text-rp-text-muted">
                    {clip.errorMessage ?? "This clip could not be exported. You can retry it."}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
          {failedClips.length && !active ? (
            <button
              type="button"
              onClick={() => void retryFailed()}
              disabled={retrying}
              className="mt-4 inline-flex min-h-11 items-center rounded-rp-md bg-rp-primary px-5 text-sm font-semibold text-white disabled:opacity-50"
            >
              {retrying ? "Starting retry…" : "Retry failed selected clips"}
            </button>
          ) : null}
        </section>
      ) : null}
      {failed && !clipResults.length ? (
        <p
          role="alert"
          className="rounded-rp-md border border-rp-danger/40 bg-rp-surface p-4 text-rp-text"
        >
          Your clips could not be exported. Your saved edits and previous exports are safe. Return
          to the editor to render again.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-rp-danger">
          {error}
        </p>
      ) : null}
      {retryError ? (
        <p role="alert" className="text-sm text-rp-danger">
          {retryError}
        </p>
      ) : null}
      {loading ? (
        <p role="status" className="text-rp-text-muted">
          Loading exports…
        </p>
      ) : !outputs.length && !active ? (
        <p className="rounded-rp-lg border border-rp-border bg-rp-surface p-6 text-rp-text-muted">
          No rendered outputs yet. Open your clip editor and render selected clips to download their
          MP4s.
        </p>
      ) : null}
      {outputGroups.map(([jobId, group]) => (
        <section
          key={jobId}
          className="space-y-3"
          aria-label={`Render attempt from ${new Date(group[0]!.createdAt).toLocaleString()}`}
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-semibold text-rp-text">Render attempt</h2>
            <p className="text-xs text-rp-text-muted">
              {new Date(group[0]!.createdAt).toLocaleString()}
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {group.map((output) => {
              const ready = output.status === "ready" && Date.parse(output.expiresAt) > Date.now();
              return (
                <article
                  key={output.id}
                  className="rounded-rp-lg border border-rp-border bg-rp-surface p-5"
                >
                  <p className="text-xs font-semibold uppercase tracking-wide text-rp-primary">
                    Vertical MP4 · 1080 × 1920
                  </p>
                  <h3 className="mt-3 text-lg font-semibold text-rp-text">{output.title}</h3>
                  <p className="mt-2 text-sm text-rp-text-muted">
                    {output.durationSeconds.toFixed(1)} seconds ·{" "}
                    {(output.fileSizeBytes / 1048576).toFixed(1)} MB
                  </p>
                  <p className="mt-2 text-xs text-rp-text-muted">
                    {ready
                      ? `Expires ${new Date(output.expiresAt).toLocaleString()}`
                      : output.status === "ready"
                        ? "Export expired"
                        : `Export ${output.status}`}
                  </p>
                  {ready ? (
                    <a
                      className="mt-5 inline-flex min-h-11 items-center rounded-rp-md bg-rp-primary px-5 text-sm font-semibold text-white"
                      href={`${base}/projects/${encodeURIComponent(projectId)}/outputs/${output.id}/download`}
                    >
                      Download MP4
                    </a>
                  ) : (
                    <span className="mt-5 inline-flex min-h-11 items-center text-sm text-rp-text-muted">
                      Download unavailable
                    </span>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
