import { loadWebConfig } from "@repurposepro/config";
import { ArrowLeft } from "lucide-react";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { AppSidebar } from "@/components/app/app-sidebar";
import { AppTopbar } from "@/components/app/app-topbar";
import { LiveProcessingPanel } from "@/features/processing/components/live-processing-panel";
import { isPreviewReady } from "@/features/processing/processing-status";
import { getProjectProcessingStatus } from "@/features/processing/server/processing-api";
import { auth } from "@/lib/auth";

interface ProcessingPageProps {
  readonly params: Promise<{ projectId: string }>;
}

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
  if (isPreviewReady(snapshot)) {
    redirect(`/projects/${encodeURIComponent(projectId)}/clips`);
  }
  const { apiUrl } = loadWebConfig();

  return (
    <ProcessingShell title="Processing video" user={session.user}>
      <Link
        className="inline-flex min-h-11 items-center gap-2 text-sm text-rp-text-muted hover:text-rp-text"
        href="/dashboard"
      >
        <ArrowLeft aria-hidden="true" className="size-4" /> Back to workspace
      </Link>
      <div className="mt-7">
        <LiveProcessingPanel apiUrl={apiUrl} initialSnapshot={snapshot} projectId={projectId} />
      </div>
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
