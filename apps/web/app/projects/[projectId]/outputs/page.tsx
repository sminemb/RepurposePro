import { loadWebConfig } from "@repurposepro/config";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { AppSidebar } from "@/components/app/app-sidebar";
import { AppTopbar } from "@/components/app/app-topbar";
import { PageHeader } from "@/components/app/page-header";
import { OutputBrowser } from "@/features/rendering/components/output-browser";

export default async function OutputsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");
  const { projectId } = await params;
  return (
    <div className="flex min-h-dvh bg-rp-bg">
      <AppSidebar className="fixed inset-y-0 left-0 hidden lg:flex" />
      <div className="min-w-0 flex-1 lg:pl-66">
        <AppTopbar
          title="Your exports"
          userEmail={session.user.email}
          userName={session.user.name}
        />
        <main className="mx-auto max-w-6xl px-5 py-8 sm:px-8 lg:px-10 lg:py-12">
          <PageHeader
            title="Your exports"
            description="Render progress and downloadable MP4 clips."
          />
          <div className="mt-8">
            <OutputBrowser apiUrl={loadWebConfig().apiUrl} projectId={projectId} />
          </div>
        </main>
      </div>
    </div>
  );
}
