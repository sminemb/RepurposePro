import { Clapperboard, Plus } from "lucide-react";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AppSidebar } from "@/components/app/app-sidebar";
import { AppTopbar } from "@/components/app/app-topbar";
import { PageHeader } from "@/components/app/page-header";
import { ProjectList } from "@/features/projects/components/project-list";
import { listProjects } from "@/features/projects/server/projects-api";
import { auth } from "@/lib/auth";

export default async function DashboardPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  const firstName = session.user.name.split(" ")[0] || session.user.name;
  const projectResult = await listProjects();

  return (
    <div className="flex min-h-dvh bg-rp-bg">
      <AppSidebar className="fixed inset-y-0 left-0 hidden lg:flex" />
      <div className="min-w-0 flex-1 lg:pl-66">
        <AppTopbar title="Dashboard" userEmail={session.user.email} userName={session.user.name} />
        <main className="mx-auto max-w-[90rem] px-5 py-8 sm:px-8 lg:px-10 lg:py-12">
          <PageHeader
            actions={
              <Link
                className="inline-flex min-h-11 items-center gap-2 rounded-rp-md bg-rp-primary px-4 text-sm font-semibold text-rp-bg-deep hover:bg-rp-primary-hover"
                href="/projects/new"
              >
                <Plus aria-hidden="true" className="size-4" /> New project
              </Link>
            }
            description={`${firstName}, create a project to begin turning your video into stronger content.`}
            title="Your workspace"
          />

          <div className="mt-8">
            {projectResult.error ? (
              <section className="rounded-rp-lg border border-rp-danger/35 bg-rp-danger-soft/35 p-5 text-sm leading-6 text-rp-text" role="alert">
                {projectResult.error}
              </section>
            ) : (
              <ProjectList projects={projectResult.projects} />
            )}
          </div>

          <p className="mt-5 flex items-center gap-2 text-xs text-rp-text-muted">
            <Clapperboard aria-hidden="true" className="size-4 text-rp-primary" /> Metadata first.
            Render later.
          </p>
        </main>
      </div>
    </div>
  );
}
