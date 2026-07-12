import { Check, Clapperboard, LockKeyhole } from "lucide-react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { AppSidebar } from "@/components/app/app-sidebar";
import { AppTopbar } from "@/components/app/app-topbar";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { auth } from "@/lib/auth";

export default async function DashboardPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  const firstName = session.user.name.split(" ")[0] || session.user.name;

  return (
    <div className="flex min-h-dvh bg-rp-bg">
      <AppSidebar className="fixed inset-y-0 left-0 hidden lg:flex" />
      <div className="min-w-0 flex-1 lg:pl-66">
        <AppTopbar title="Dashboard" userEmail={session.user.email} userName={session.user.name} />
        <main className="mx-auto max-w-[90rem] px-5 py-8 sm:px-8 lg:px-10 lg:py-12">
          <PageHeader
            description={`${firstName}, your account is ready. Project creation is the next part of the journey.`}
            title="Your workspace"
          />

          <section className="mt-8 flex flex-col gap-5 rounded-rp-lg border border-rp-primary/22 bg-rp-primary-soft/35 p-5 sm:flex-row sm:items-center sm:p-6">
            <div className="grid size-12 shrink-0 place-items-center rounded-full bg-rp-primary text-white shadow-rp-glow">
              <Check aria-hidden="true" className="size-6" />
            </div>
            <div>
              <h2 className="font-semibold text-rp-text">Your account is ready</h2>
              <p className="mt-1 text-sm leading-6 text-rp-text-muted">
                Authentication is secure and your private workspace is active.
              </p>
            </div>
            <div className="sm:ml-auto">
              <span
                aria-disabled="true"
                className="inline-flex min-h-11 cursor-not-allowed items-center gap-2 rounded-rp-md border border-rp-border bg-rp-surface px-4 text-sm text-rp-text-disabled"
              >
                <LockKeyhole aria-hidden="true" className="size-4" /> New project locked
              </span>
            </div>
          </section>

          <div className="mt-8">
            <EmptyState
              description="Project creation arrives next. Soon, this space will hold every source video, selected clip, summary, and final output."
              icon={<Clapperboard aria-hidden="true" className="size-7" />}
              title="No projects yet"
            />
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
