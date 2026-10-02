import { headers } from "next/headers";
import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { loadWebConfig } from "@repurposepro/config";
import { summaryStateSchema } from "@repurposepro/shared";
import { auth } from "@/lib/auth";
import { requestApi } from "@/lib/server-api";
import { AppSidebar } from "@/components/app/app-sidebar";
import { AppTopbar } from "@/components/app/app-topbar";
import { PageHeader } from "@/components/app/page-header";
import { SummaryPreviewEditor } from "@/features/summary/components/summary-preview-editor";
export default async function SummaryPage({ params }: { params: Promise<{ projectId: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");
  const { projectId } = await params;
  const response = await requestApi(`/projects/${encodeURIComponent(projectId)}/summary`).catch(
    () => null,
  );
  if (response?.status === 401) redirect("/login");
  if (response?.status === 404) notFound();
  const body = response?.ok
    ? ((await response.json().catch(() => null)) as { data: unknown } | null)
    : null;
  const parsed = summaryStateSchema.safeParse(body?.data);
  return (
    <div className="flex min-h-dvh bg-rp-bg">
      <AppSidebar className="fixed inset-y-0 left-0 hidden lg:flex" />
      <div className="min-w-0 flex-1 lg:pl-66">
        <AppTopbar
          title="Summary editor"
          userEmail={session.user.email}
          userName={session.user.name}
        />
        <main className="mx-auto max-w-[100rem] px-5 py-8 sm:px-8 lg:px-10 lg:py-12">
          <PageHeader
            title="Your summary editor"
            description="Keep the important ideas, refine the cuts, and export a chronological recap."
          />
          <div className="mt-8">
            {parsed.success ? (
              <SummaryPreviewEditor
                initial={parsed.data}
                apiUrl={loadWebConfig().apiUrl}
                projectId={projectId}
                userId={session.user.id}
              />
            ) : (
              <section
                role="alert"
                className="rounded-rp-md border border-rp-border p-6 text-rp-text"
              >
                <p>Your summary is temporarily unavailable. Try again from your workspace.</p>
                <Link
                  className="mt-4 inline-flex min-h-11 items-center text-rp-primary"
                  href="/dashboard"
                >
                  Back to workspace
                </Link>
              </section>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
