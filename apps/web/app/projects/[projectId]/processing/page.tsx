import type { ProcessingJobStep } from "@repurposepro/shared";
import { ArrowLeft, Clock3, Sparkles } from "lucide-react";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { AppSidebar } from "@/components/app/app-sidebar";
import { AppTopbar } from "@/components/app/app-topbar";
import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { getProjectProcessingStatus } from "@/features/processing/server/processing-api";
import { auth } from "@/lib/auth";

interface ProcessingPageProps {
  readonly params: Promise<{ projectId: string }>;
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

export default async function ProcessingPage({ params }: ProcessingPageProps) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  const { projectId } = await params;
  const result = await getProjectProcessingStatus(projectId);
  if (result.kind === "unauthenticated") redirect("/login");
  if (result.kind === "not_found") notFound();

  if (result.kind === "unavailable") {
    return <ProcessingPageError message={result.message} session={session.user} />;
  }

  const snapshot = result.snapshot;
  if (["draft", "uploaded", "waiting_for_payment"].includes(snapshot.status)) {
    redirect(`/projects/${encodeURIComponent(projectId)}/upload`);
  }

  if (!snapshot.currentJob) {
    return (
      <ProcessingPageError
        message="This project's processing status is incomplete. Return to your dashboard and try again."
        session={session.user}
      />
    );
  }

  const job = snapshot.currentJob;
  const queued = snapshot.status === "queued";

  return (
    <ProcessingShell title="Processing video" user={session.user}>
      <Link
        className="inline-flex min-h-11 items-center gap-2 text-sm text-rp-text-muted hover:text-rp-text"
        href="/dashboard"
      >
        <ArrowLeft aria-hidden="true" className="size-4" /> Back to workspace
      </Link>
      <div className="mt-7">
        <PageHeader
          description="Your saved processing state is available whenever you return."
          title={queued ? "Your video is queued" : "Your video is processing"}
        />
      </div>

      <section
        aria-labelledby="processing-state-title"
        aria-live="polite"
        className="mt-8 overflow-hidden rounded-rp-lg border border-rp-border bg-rp-surface/70 shadow-rp-card"
      >
        <div className="border-b border-rp-border bg-rp-primary-soft/30 p-5 sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <span className="grid size-12 shrink-0 place-items-center rounded-rp-md border border-rp-primary/30 bg-rp-primary-soft text-rp-primary shadow-rp-glow">
                {queued ? (
                  <Clock3 aria-hidden="true" className="size-6" />
                ) : (
                  <Sparkles aria-hidden="true" className="size-6" />
                )}
              </span>
              <div>
                <h2 id="processing-state-title" className="text-lg font-semibold text-rp-text">
                  {queued ? "Waiting to begin analysis" : "Analysis is underway"}
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
            <p className="mt-2 text-base font-semibold text-rp-text">
              {job.step ? stepLabels[job.step] : "Waiting for the next step"}
            </p>
          </div>
          <div className="rounded-rp-md border border-rp-border bg-rp-card/65 p-4">
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-rp-text-muted">
              Progress
            </p>
            <p className="mt-2 text-base font-semibold text-rp-text">
              {job.progress === null ? "No progress estimate yet" : `${job.progress}% complete`}
            </p>
          </div>
        </div>
      </section>
    </ProcessingShell>
  );
}

function ProcessingPageError({
  message,
  session,
}: {
  readonly message: string;
  readonly session: { readonly email: string; readonly name: string };
}) {
  return (
    <ProcessingShell title="Processing video" user={session}>
      <section
        className="rounded-rp-lg border border-rp-danger/35 bg-rp-danger-soft/35 p-5 text-sm leading-6 text-rp-text sm:p-7"
        role="alert"
      >
        <p>{message}</p>
        <Link
          className="mt-4 inline-flex min-h-11 items-center font-semibold text-rp-primary"
          href="/dashboard"
        >
          Return to dashboard
        </Link>
      </section>
    </ProcessingShell>
  );
}

function ProcessingShell({
  children,
  title,
  user,
}: {
  readonly children: React.ReactNode;
  readonly title: string;
  readonly user: { readonly email: string; readonly name: string };
}) {
  return (
    <div className="flex min-h-dvh bg-rp-bg">
      <AppSidebar className="fixed inset-y-0 left-0 hidden lg:flex" />
      <div className="min-w-0 flex-1 lg:pl-66">
        <AppTopbar title={title} userEmail={user.email} userName={user.name} />
        <main className="mx-auto max-w-4xl px-5 py-8 sm:px-8 lg:px-10 lg:py-12">{children}</main>
      </div>
    </div>
  );
}
