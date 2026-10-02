"use client";

import type { ProcessingStartResult } from "@repurposepro/shared";
import Link from "next/link";
import { useState } from "react";

import {
  loadAnalysisRetryDetails,
  RetainedUploadUnavailableError,
} from "../client/analysis-retry-api";
import { ProcessingStartPanel } from "./processing-start-panel";

export function AnalysisRetryPanel({
  apiUrl,
  projectId,
  onStarted,
}: {
  readonly apiUrl: string;
  readonly projectId: string;
  readonly onStarted: (result: ProcessingStartResult) => void;
}) {
  const [details, setDetails] = useState<Awaited<
    ReturnType<typeof loadAnalysisRetryDetails>
  > | null>(null);
  const [pending, setPending] = useState(false);
  const [issue, setIssue] = useState<"unavailable" | "temporary" | null>(null);

  async function prepare() {
    setPending(true);
    setIssue(null);
    try {
      setDetails(await loadAnalysisRetryDetails(apiUrl, projectId));
    } catch (error) {
      setIssue(error instanceof RetainedUploadUnavailableError ? "unavailable" : "temporary");
    } finally {
      setPending(false);
    }
  }

  if (details)
    return (
      <ProcessingStartPanel
        {...details}
        apiUrl={apiUrl}
        projectId={projectId}
        balanceError={null}
        retry
        onStarted={onStarted}
      />
    );
  return (
    <div className="mt-5">
      {issue ? (
        <p role="alert" className="mb-3 text-sm leading-6 text-rp-text-muted">
          {issue === "unavailable"
            ? "Your retained upload is no longer available. Create a new project and upload your video again."
            : "We could not refresh your upload details and credit balance. Try again."}
        </p>
      ) : null}
      {issue === "unavailable" ? (
        <Link
          className="inline-flex min-h-11 items-center text-sm font-semibold text-rp-primary"
          href="/projects/new"
        >
          Create a new project
        </Link>
      ) : (
        <button
          type="button"
          aria-busy={pending}
          disabled={pending}
          onClick={() => void prepare()}
          className="inline-flex min-h-11 items-center rounded-rp-md border border-rp-primary/40 px-5 text-sm font-semibold text-rp-primary hover:bg-rp-primary-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rp-primary disabled:opacity-60"
        >
          {pending ? "Checking upload and balance…" : "Try analysis again"}
        </button>
      )}
      <p className="mt-2 text-xs leading-5 text-rp-text-muted">
        Review your current cost and balance before confirming a new charge.
      </p>
    </div>
  );
}
