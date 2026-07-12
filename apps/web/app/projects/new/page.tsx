import { ArrowLeft } from "lucide-react";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AppSidebar } from "@/components/app/app-sidebar";
import { AppTopbar } from "@/components/app/app-topbar";
import { PageHeader } from "@/components/app/page-header";
import { NewProjectForm } from "@/features/projects/components/new-project-form";
import { auth } from "@/lib/auth";

export default async function NewProjectPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  return (
    <div className="flex min-h-dvh bg-rp-bg">
      <AppSidebar className="fixed inset-y-0 left-0 hidden lg:flex" />
      <div className="min-w-0 flex-1 lg:pl-66">
        <AppTopbar title="New project" userEmail={session.user.email} userName={session.user.name} />
        <main className="mx-auto max-w-4xl px-5 py-8 sm:px-8 lg:px-10 lg:py-12">
          <Link className="inline-flex min-h-11 items-center gap-2 text-sm text-rp-text-muted hover:text-rp-text" href="/dashboard">
            <ArrowLeft aria-hidden="true" className="size-4" /> Back to workspace
          </Link>
          <div className="mt-7 rounded-rp-lg border border-rp-border bg-rp-surface/55 p-5 sm:p-7">
            <PageHeader
              description="Start by naming your project and choosing the output you want to create."
              title="Create a project"
            />
            <div className="mt-8 border-t border-rp-border pt-8">
              <NewProjectForm />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
