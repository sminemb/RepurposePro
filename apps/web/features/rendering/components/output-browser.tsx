"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  outputListSchema,
  type OutputMetadata,
  type ProjectProcessingStatus,
} from "@repurposepro/shared";
import { createProcessingStatusPoller } from "@/features/processing/client/processing-status-poller";
import { loadProcessingStatus } from "@/features/processing/client/processing-status-api";

export function OutputBrowser({ apiUrl, projectId }: { apiUrl: string; projectId: string }) {
  const [outputs, setOutputs] = useState<OutputMetadata[]>([]),
    [snapshot, setSnapshot] = useState<ProjectProcessingStatus | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    const loadOutputs = async () => {
      try {
        const response = await fetch(
          `${apiUrl.replace(/\/$/u, "")}/projects/${encodeURIComponent(projectId)}/outputs`,
          { credentials: "include", cache: "no-store", signal: controller.signal },
        );
        if (!response.ok)
          throw new Error(
            response.status === 401
              ? "Sign in again to view your exports."
              : "Exports are temporarily unavailable. Refresh to try again.",
          );
        const body = (await response.json()) as { data: unknown };
        const next = outputListSchema.parse(body.data);
        if (!controller.signal.aborted) {
          setOutputs(next);
          setError("");
          setLoading(false);
        }
      } catch (failure) {
        if (!controller.signal.aborted) {
          setLoading(false);
          setError(failure instanceof Error ? failure.message : "Exports unavailable.");
        }
      }
    };
    void loadOutputs();
    const poller = createProcessingStatusPoller({
      load: (signal) => loadProcessingStatus(apiUrl, projectId, signal),
      getVisibilityState: () => document.visibilityState,
      onFailure: () => setError("Live updates are temporarily unavailable. We will keep trying."),
      onPreviewReady: () => undefined,
      onSnapshot: (next) => {
        setSnapshot(next);
        if (next.currentJob?.status === "completed" || next.currentJob?.status === "failed")
          void loadOutputs();
      },
      subscribeVisibility: (listener) => {
        document.addEventListener("visibilitychange", listener);
        return () => document.removeEventListener("visibilitychange", listener);
      },
    });
    poller.start();
    return () => {
      controller.abort();
      poller.stop();
    };
  }, [apiUrl, projectId]);
  const job = snapshot?.currentJob;
  const active = job?.status === "queued" || job?.status === "active";
  const failed = job?.status === "failed";
  const steps: Record<string, string> = {
    queued: "Waiting to render",
    preparing: "Preparing your clip",
    rendering: "Rendering your MP4",
    saving_output: "Saving your export",
    completed: "Render complete",
    failed: "Render stopped",
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
      {active ? (
        <section
          aria-live="polite"
          className="rounded-rp-lg border border-rp-border bg-rp-surface p-6"
        >
          <h2 className="font-semibold text-rp-text">
            {steps[job.step ?? "queued"] ?? "Rendering"}
          </h2>
          <p className="mt-2 text-sm text-rp-text-muted">
            You can leave this page while your saved clip renders.
          </p>
          <div
            role="progressbar"
            aria-label="Render progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={job.progress ?? 0}
            className="mt-4 h-2 overflow-hidden rounded-full bg-rp-border"
          >
            <div className="h-full bg-rp-primary" style={{ width: `${job.progress ?? 0}%` }} />
          </div>
          <p className="mt-2 text-sm text-rp-text-muted">{job.progress ?? 0}%</p>
        </section>
      ) : null}
      {failed ? (
        <p
          role="alert"
          className="rounded-rp-md border border-rp-danger/40 bg-rp-surface p-4 text-rp-text"
        >
          Your clip could not be exported. Your saved edits and previous exports are safe. Return to
          the editor to render again.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-rp-danger">
          {error}
        </p>
      ) : null}
      {loading ? (
        <p role="status" className="text-rp-text-muted">
          Loading exports…
        </p>
      ) : !outputs.length && !active ? (
        <p className="rounded-rp-lg border border-rp-border bg-rp-surface p-6 text-rp-text-muted">
          No rendered outputs yet. Open your clip editor and render a clip to download its MP4.
        </p>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {outputs.map((output) => {
          const ready = output.status === "ready" && Date.parse(output.expiresAt) > Date.now();
          return (
            <article
              key={output.id}
              className="rounded-rp-lg border border-rp-border bg-rp-surface p-5"
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-rp-primary">
                Vertical MP4 · 1080 × 1920
              </p>
              <h2 className="mt-3 text-lg font-semibold text-rp-text">{output.title}</h2>
              <p className="mt-2 text-sm text-rp-text-muted">
                {output.durationSeconds.toFixed(1)} seconds ·{" "}
                {(output.fileSizeBytes / 1048576).toFixed(1)} MB
              </p>
              <p className="mt-2 text-xs text-rp-text-muted">
                {ready
                  ? `Expires ${new Date(output.expiresAt).toLocaleString()}`
                  : `Export ${output.status}`}
              </p>
              {ready ? (
                <a
                  className="mt-5 inline-flex min-h-11 items-center rounded-rp-md bg-rp-primary px-5 text-sm font-semibold text-white"
                  href={`${apiUrl.replace(/\/$/u, "")}/projects/${encodeURIComponent(projectId)}/outputs/${output.id}/download`}
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
    </div>
  );
}
