import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Clapperboard } from "lucide-react";

import { BrandMark } from "@/components/app/brand-mark";
import { auth } from "@/lib/auth";

export default async function DashboardPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  return (
    <main className="min-h-screen px-5 py-6 sm:px-8 lg:px-12">
      <header className="mx-auto flex max-w-6xl items-center justify-between border-b border-rp-border pb-5">
        <BrandMark />
        <form action="/api/auth/sign-out" method="post">
          <button className="text-sm text-rp-text-muted hover:text-rp-text" type="submit">
            Sign out
          </button>
        </form>
      </header>
      <section className="mx-auto max-w-6xl py-14">
        <h1 className="text-3xl font-semibold tracking-[-0.04em] text-rp-text">
          Welcome, {session.user.name}
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-rp-text-muted">
          You are signed in as {session.user.email}. Video projects arrive in the next slice.
        </p>
        <section className="mt-10 grid min-h-72 place-items-center rounded-rp-lg border border-rp-border bg-rp-card p-8 text-center">
          <div className="max-w-md">
            <div className="mx-auto grid size-12 place-items-center rounded-rp-md bg-rp-primary-soft text-rp-primary">
              <Clapperboard className="size-6" aria-hidden="true" />
            </div>
            <h2 className="mt-5 text-lg font-semibold text-rp-text">No projects yet</h2>
            <p className="mt-2 text-sm leading-6 text-rp-text-muted">
              Your workspace is ready. Create your first project once secure video uploads are
              available.
            </p>
          </div>
        </section>
      </section>
    </main>
  );
}
