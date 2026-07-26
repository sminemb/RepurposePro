"use client";

import type { CreditBalance, SourceVideoMetadata } from "@repurposepro/shared";
import {
  AlertTriangle,
  ArrowRight,
  CreditCard,
  LoaderCircle,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ProcessingRequestError, startProcessing } from "../client/processing-api";
import { getCreditStartState } from "./credit-start-state";

interface ProcessingStartPanelProps {
  readonly apiUrl: string;
  readonly balance: CreditBalance | null;
  readonly balanceError: string | null;
  readonly metadata: SourceVideoMetadata;
  readonly projectId: string;
}

export function ProcessingStartPanel({
  apiUrl,
  balance,
  balanceError,
  metadata,
  projectId,
}: ProcessingStartPanelProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const creditState = getCreditStartState(balance?.balance ?? null, metadata.requiredCredits);

  async function start(): Promise<void> {
    setError(null);
    setPending(true);

    try {
      await startProcessing({ apiUrl, projectId });
      router.push(`/projects/${encodeURIComponent(projectId)}/processing`);
    } catch (reason) {
      setError(
        reason instanceof ProcessingRequestError
          ? reason.message
          : "We could not start processing. Try again.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <section
      aria-labelledby="processing-cost-title"
      className="mt-5 rounded-rp-lg border border-rp-primary/30 bg-rp-primary-soft/35 p-5"
    >
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-rp-md border border-rp-primary/30 bg-rp-primary-soft text-rp-primary">
          <CreditCard aria-hidden="true" className="size-5" />
        </span>
        <div>
          <h2 id="processing-cost-title" className="text-base font-semibold text-rp-text">
            Confirm processing cost
          </h2>
          <p className="mt-1 text-sm leading-6 text-rp-text-muted">
            Credits are deducted once when you start analysis.
          </p>
        </div>
      </div>

      <dl className="mt-5 grid gap-3 sm:grid-cols-3">
        <CostItem label="Required credits" value={String(metadata.requiredCredits)} />
        <CostItem
          label="Current balance"
          value={balance ? String(balance.balance) : "Unavailable"}
        />
        <CostItem
          label="Balance after start"
          value={
            creditState.kind === "ready"
              ? String(creditState.remainingBalance)
              : creditState.kind === "insufficient"
                ? `Short by ${creditState.creditsShort}`
                : "Unavailable"
          }
        />
      </dl>

      <p className="mt-4 flex items-start gap-2 text-sm leading-6 text-rp-text-muted">
        <ShieldCheck aria-hidden="true" className="mt-1 size-4 shrink-0 text-rp-success" />
        Credits are charged once. Retrying the same queued analysis will not charge them again.
      </p>

      {balanceError ? (
        <div
          className="mt-4 rounded-rp-md border border-rp-warning/35 bg-rp-warning-soft/35 p-4"
          role="alert"
        >
          <p className="flex items-start gap-2 text-sm leading-6 text-rp-text">
            <AlertTriangle aria-hidden="true" className="mt-1 size-4 shrink-0 text-rp-warning" />
            {balanceError}
          </p>
          <button
            className="mt-3 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-rp-primary hover:text-rp-text"
            type="button"
            onClick={() => router.refresh()}
          >
            <RotateCcw aria-hidden="true" className="size-4" /> Refresh balance
          </button>
        </div>
      ) : null}

      {error ? (
        <p
          aria-live="assertive"
          className="mt-4 rounded-rp-md border border-rp-danger/35 bg-rp-danger-soft/40 px-4 py-3 text-sm leading-6 text-rp-text"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <div className="mt-5 flex flex-wrap items-center justify-end gap-3">
        {creditState.kind === "insufficient" ? (
          <Link
            className="inline-flex min-h-11 items-center gap-2 rounded-rp-md bg-rp-primary px-5 text-sm font-semibold text-rp-primary-foreground hover:bg-rp-primary-hover"
            href="/billing"
          >
            Buy credits <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
        ) : creditState.kind === "ready" ? (
          <button
            aria-busy={pending}
            className="inline-flex min-h-11 items-center gap-2 rounded-rp-md bg-rp-primary px-5 text-sm font-semibold text-rp-primary-foreground transition-colors hover:bg-rp-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rp-primary disabled:cursor-not-allowed disabled:opacity-60"
            disabled={pending}
            type="button"
            onClick={() => void start()}
          >
            {pending ? (
              <LoaderCircle
                aria-hidden="true"
                className="size-4 animate-spin motion-reduce:animate-none"
              />
            ) : null}
            {pending
              ? "Starting processing"
              : `Start processing for ${metadata.requiredCredits} credits`}
          </button>
        ) : null}
      </div>
    </section>
  );
}

function CostItem({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="rounded-rp-md border border-rp-border bg-rp-card/65 px-4 py-3">
      <dt className="text-xs text-rp-text-muted">{label}</dt>
      <dd className="mt-1 text-lg font-semibold text-rp-text">{value}</dd>
    </div>
  );
}
