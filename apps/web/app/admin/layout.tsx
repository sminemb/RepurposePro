import type { ReactNode } from "react";
import Link from "next/link";
import { AppSidebar } from "@/components/app/app-sidebar";
import { AppTopbar } from "@/components/app/app-topbar";
import { getAdminSession } from "@/features/admin/server/admin-api";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · RepurposePro", robots: { index: false, follow: false } };
export default async function AdminLayout({ children }: { readonly children: ReactNode }) {
  const session = await getAdminSession();
  if (!session)
    return (
      <main className="mx-auto max-w-xl px-6 py-20 text-rp-text">
        <h1 className="text-2xl font-semibold">Access denied</h1>
        <p className="mt-4 text-rp-text-muted">You do not have access to this area.</p>
        <Link className="mt-6 inline-block text-rp-primary underline" href="/dashboard">
          Return to dashboard
        </Link>
      </main>
    );
  return (
    <div className="flex min-h-dvh bg-rp-bg">
      <AppSidebar isAdmin className="fixed inset-y-0 left-0 hidden lg:flex" />
      <div className="min-w-0 flex-1 lg:pl-66">
        <AppTopbar title="Admin" userEmail={session.user.email} userName={session.user.name} />
        <main className="mx-auto max-w-[90rem] px-5 py-8 sm:px-8 lg:px-10">
          <nav aria-label="Admin" className="mb-8 flex flex-wrap gap-2">
            {["overview", "search", "users", "projects", "jobs", "payments"].map((item) => (
              <Link
                key={item}
                href={item === "overview" ? "/admin" : `/admin/${item}`}
                className="rounded-rp-md border border-rp-border px-4 py-3 text-sm capitalize text-rp-text-muted hover:bg-rp-card hover:text-rp-text focus-visible:outline-2 focus-visible:outline-rp-primary"
              >
                {item}
              </Link>
            ))}
          </nav>
          {children}
        </main>
      </div>
    </div>
  );
}
