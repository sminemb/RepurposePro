import { loadWebConfig } from "@repurposepro/config";
import { ArrowLeft } from "lucide-react";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { AppSidebar } from "@/components/app/app-sidebar";
import { AppTopbar } from "@/components/app/app-topbar";
import { PageHeader } from "@/components/app/page-header";
import { ClipPreviewBrowser } from "@/features/clips/components/clip-preview-browser";
import { getProjectClips } from "@/features/clips/server/clips-api";
import { auth } from "@/lib/auth";

interface ClipsPageProps {
  readonly params: Promise<{ projectId: string }>;
}

export default async function ClipsPage({ params }: ClipsPageProps) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");
  const { projectId } = await params;
  const result = await getProjectClips(projectId);
  if (result.kind === "unauthenticated") redirect("/login");
  if (result.kind === "not_found") notFound();
  if (result.kind === "unavailable") {
    return (
      <ClipsShell user={session.user}>
        <section
          className="rounded-rp-lg border border-rp-danger/35 bg-rp-danger-soft/35 p-6"
          role="alert"
        >
          <h1 className="text-lg font-semibold text-rp-text">
            Previews are temporarily unavailable
          </h1>
          <p className="mt-2 text-sm leading-6 text-rp-text-muted">
            We could not load your clip previews. Return to your dashboard and try again.
          </p>
          <Link
            className="mt-4 inline-flex min-h-11 items-center font-semibold text-rp-primary"
            href="/dashboard"
          >
            Return to dashboard
          </Link>
        </section>
      </ClipsShell>
    );
  }
  const { apiUrl } = loadWebConfig();

  return (
    <ClipsShell user={session.user}>
      <Link
        className="inline-flex min-h-11 items-center gap-2 text-sm text-rp-text-muted hover:text-rp-text"
        href="/dashboard"
      >
        <ArrowLeft aria-hidden="true" className="size-4" /> Back to workspace
      </Link>
      <div className="mt-7">
        <PageHeader
          description="Review timestamped browser previews before choosing anything to edit or render."
          title="Your clip previews"
        />
      </div>
      <div className="mt-8">
        <ClipPreviewBrowser apiUrl={apiUrl} clips={result.clips.clips} projectId={projectId} />
      </div>
    </ClipsShell>
  );
}

function ClipsShell({
  children,
  user,
}: {
  readonly children: React.ReactNode;
  readonly user: { readonly email: string; readonly name: string };
}) {
  return (
    <div className="flex min-h-dvh bg-rp-bg">
      <AppSidebar className="fixed inset-y-0 left-0 hidden lg:flex" />
      <div className="min-w-0 flex-1 lg:pl-66">
        <AppTopbar title="Clip previews" userEmail={user.email} userName={user.name} />
        <main className="mx-auto max-w-6xl px-5 py-8 sm:px-8 lg:px-10 lg:py-12">{children}</main>
      </div>
    </div>
  );
}
