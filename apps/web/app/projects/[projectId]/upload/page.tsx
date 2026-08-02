import { ArrowLeft, UploadCloud } from "lucide-react";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AppSidebar } from "@/components/app/app-sidebar";
import { AppTopbar } from "@/components/app/app-topbar";
import { PageHeader } from "@/components/app/page-header";
import { getCreditBalance } from "@/features/billing/server/billing-api";
import { ProcessingStartPanel } from "@/features/processing/components/processing-start-panel";
import { UploadDropzone } from "@/features/upload/components/upload-dropzone";
import { VideoMetadataCard } from "@/features/upload/components/video-metadata-card";
import { getSavedSourceVideo } from "@/features/upload/server/source-video-api";
import { auth } from "@/lib/auth";
import { loadWebConfig } from "@repurposepro/config";

interface UploadPageProps {
  readonly params: Promise<{ projectId: string }>;
}

export default async function UploadPage({ params }: UploadPageProps) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  const { projectId } = await params;
  const [balanceResult, sourceVideoResult] = await Promise.all([
    getCreditBalance(),
    getSavedSourceVideo(projectId),
  ]);
  if (balanceResult.kind === "unauthenticated") redirect("/login");
  if (sourceVideoResult.kind === "unauthenticated") redirect("/login");

  const apiUrl = loadWebConfig().apiUrl;
  const balance = balanceResult.kind === "success" ? balanceResult.balance : null;
  const balanceError = balanceResult.kind === "unavailable" ? balanceResult.message : null;
  const sourceVideoView = (() => {
    switch (sourceVideoResult.kind) {
      case "success":
        return {
          content: "saved" as const,
          description: "Your original video is saved to this project and ready for processing.",
          metadata: sourceVideoResult.metadata,
          title: "Your source video",
        };
      case "missing":
        return {
          content: "upload" as const,
          description:
            "Start with your original local video. We will validate the file before you see the credit estimate.",
          title: "Upload your source video",
        };
      case "unavailable":
        return {
          content: "unavailable" as const,
          description: "We need to verify your saved video before you can continue.",
          message: sourceVideoResult.message,
          title: "Source video unavailable",
        };
    }
  })();

  return (
    <div className="flex min-h-dvh bg-rp-bg">
      <AppSidebar className="fixed inset-y-0 left-0 hidden lg:flex" />
      <div className="min-w-0 flex-1 lg:pl-66">
        <AppTopbar
          title="Upload video"
          userEmail={session.user.email}
          userName={session.user.name}
        />
        <main className="mx-auto max-w-4xl px-5 py-8 sm:px-8 lg:px-10 lg:py-12">
          <Link
            className="inline-flex min-h-11 items-center gap-2 text-sm text-rp-text-muted hover:text-rp-text"
            href="/dashboard"
          >
            <ArrowLeft aria-hidden="true" className="size-4" /> Back to workspace
          </Link>
          <div className="mt-7 rounded-rp-lg border border-rp-border bg-rp-surface/55 p-5 sm:p-7">
            <PageHeader description={sourceVideoView.description} title={sourceVideoView.title} />
            <div className="mt-8 border-t border-rp-border pt-8">
              {sourceVideoView.content === "saved" ? (
                <>
                  <VideoMetadataCard metadata={sourceVideoView.metadata} />
                  <ProcessingStartPanel
                    apiUrl={apiUrl}
                    balance={balance}
                    balanceError={balanceError}
                    metadata={sourceVideoView.metadata}
                    projectId={projectId}
                  />
                </>
              ) : sourceVideoView.content === "upload" ? (
                <UploadDropzone
                  apiUrl={apiUrl}
                  balance={balance}
                  balanceError={balanceError}
                  projectId={projectId}
                />
              ) : (
                <div
                  className="rounded-rp-md border border-rp-warning/35 bg-rp-warning-soft/35 px-4 py-3 text-sm leading-6 text-rp-text"
                  role="alert"
                >
                  {sourceVideoView.message}
                </div>
              )}
            </div>
            <p className="mt-6 flex items-center gap-2 text-xs leading-5 text-rp-text-muted">
              <UploadCloud aria-hidden="true" className="size-4 text-rp-primary" /> Your original
              video stays private to this project.
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}
