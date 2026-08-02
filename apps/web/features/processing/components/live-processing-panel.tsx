"use client";

import {
  ProcessingJobStatus,
  ProjectStatus,
  type ProcessingJobStep,
  type ProjectProcessingStatus,
} from "@repurposepro/shared";
import { AlertTriangle, Clock3, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";

import { loadProcessingStatus } from "../client/processing-status-api";
import { createProcessingStatusPoller } from "../client/processing-status-poller";

interface LiveProcessingPanelProps {
  readonly apiUrl: string;
  readonly initialSnapshot: ProjectProcessingStatus;
  readonly projectId: string;
}

const stepLabels: Record<ProcessingJobStep, string> = {
  analyzing: "Analyzing your transcript",
  completed: "Completed",
  extracting_audio: "Extracting audio",
  failed: "Processing stopped",
  generating_preview: "Generating previews",
  preparing: "Preparing your video",
  preview_ready: "Preview ready",
  queued: "Queued for analysis",
  rendering: "Rendering video",
  saving_output: "Saving output",
  transcribing: "Transcribing audio",
};

export function LiveProcessingPanel({
  apiUrl,
  initialSnapshot,
  projectId,
}: LiveProcessingPanelProps) {
  const router = useRouter();
  const [pollingIssue, setPollingIssue] = useState(false);
  const [snapshot, setSnapshot] = useState(initialSnapshot);

  useEffect(() => {
    const poller = createProcessingStatusPoller({
      getVisibilityState: () => document.visibilityState,
      load: (signal) => loadProcessingStatus(apiUrl, projectId, signal),
      onFailure: () => setPollingIssue(true),
      onPreviewReady: () => {
        router.replace(`/projects/${encodeURIComponent(projectId)}/clips`);
      },
      onSnapshot: (nextSnapshot) => {
        setPollingIssue(false);
        setSnapshot(nextSnapshot);
      },
      subscribeVisibility: (listener) => {
        document.addEventListener("visibilitychange", listener);
        return () => document.removeEventListener("visibilitychange", listener);
      },
    });
    poller.start();
    return () => poller.stop();
  }, [apiUrl, projectId, router]);

  const job = snapshot.currentJob;
  const queued = snapshot.status === ProjectStatus.Queued;
  const failed =
    snapshot.status === ProjectStatus.Failed || job?.status === ProcessingJobStatus.Failed;
  const step = job?.step ? stepLabels[job.step] : "Waiting for the next step";
  const progress = job?.progress ?? null;
  const announcement = `${step}. ${progress === null ? "Progress estimate pending." : `${progress}% complete.`}`;

  return (
    <>
      <PageHeader
        description="This page refreshes automatically while your analysis runs in the background."
        title={
          failed
            ? "Processing stopped"
            : queued
              ? "Your video is queued"
              : "Your video is processing"
        }
      />

      <p aria-atomic="true" aria-live="polite" className="sr-only">
        {announcement}
      </p>

      <section
        aria-labelledby="processing-state-title"
        className="mt-8 overflow-hidden rounded-rp-lg border border-rp-border bg-rp-surface/70 shadow-rp-card"
      >
        <div className="border-b border-rp-border bg-rp-primary-soft/30 p-5 sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <span className="grid size-12 shrink-0 place-items-center rounded-rp-md border border-rp-primary/30 bg-rp-primary-soft text-rp-primary shadow-rp-glow">
                {failed ? (
                  <AlertTriangle aria-hidden="true" className="size-6" />
                ) : queued ? (
                  <Clock3 aria-hidden="true" className="size-6" />
                ) : (
                  <Sparkles aria-hidden="true" className="size-6" />
                )}
              </span>
              <div>
                <h2 id="processing-state-title" className="text-lg font-semibold text-rp-text">
                  {failed
                    ? "Analysis needs attention"
                    : queued
                      ? "Waiting to begin analysis"
                      : "Analysis is underway"}
                </h2>
                <p className="mt-2 max-w-xl text-sm leading-6 text-rp-text-muted">
                  Processing continues in the background. You can leave this page and return from
                  your dashboard.
                </p>
              </div>
            </div>
            <StatusBadge status={snapshot.status} />
          </div>
        </div>

        <div className="grid gap-4 p-5 sm:grid-cols-2 sm:p-7">
          <div className="rounded-rp-md border border-rp-border bg-rp-card/65 p-4">
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-rp-text-muted">
              Current step
            </p>
            <p className="mt-2 text-base font-semibold text-rp-text">{step}</p>
          </div>
          <div className="rounded-rp-md border border-rp-border bg-rp-card/65 p-4">
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-rp-text-muted">
              Progress
            </p>
            <p className="mt-2 text-base font-semibold text-rp-text">
              {progress === null ? "No progress estimate yet" : `${progress}% complete`}
            </p>
            {progress !== null ? (
              <div
                aria-label="Processing progress"
                aria-valuemax={100}
                aria-valuemin={0}
                aria-valuenow={progress}
                className="mt-3 h-2 overflow-hidden rounded-full bg-rp-border"
                role="progressbar"
              >
                <div
                  className="h-full rounded-full bg-rp-primary transition-[width] duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
            ) : null}
          </div>
        </div>

        {pollingIssue ? (
          <p className="border-t border-rp-warning/25 bg-rp-warning-soft/25 px-5 py-3 text-sm text-rp-text-muted sm:px-7">
            Live updates are temporarily unavailable. We will keep trying while this page is open.
          </p>
        ) : null}
      </section>
    </>
  );
}
