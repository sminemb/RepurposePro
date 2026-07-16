import { CREDIT_PACKS } from "@repurposepro/shared";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { AppSidebar } from "@/components/app/app-sidebar";
import { AppTopbar } from "@/components/app/app-topbar";
import { PageHeader } from "@/components/app/page-header";
import { CreditBalanceCard } from "@/features/billing/components/credit-balance-card";
import { CreditBalanceError } from "@/features/billing/components/credit-balance-error";
import { CreditPackCard } from "@/features/billing/components/credit-pack-card";
import { getCreditBalance } from "@/features/billing/server/billing-api";
import { auth } from "@/lib/auth";

export default async function BillingPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  const balanceResult = await getCreditBalance();
  if (balanceResult.kind === "unauthenticated") redirect("/login");

  return (
    <div className="flex min-h-dvh bg-rp-bg">
      <AppSidebar className="fixed inset-y-0 left-0 hidden lg:flex" />
      <div className="min-w-0 flex-1 lg:pl-66">
        <AppTopbar title="Billing" userEmail={session.user.email} userName={session.user.name} />
        <main className="mx-auto max-w-[90rem] px-5 py-8 sm:px-8 lg:px-10 lg:py-12">
          <PageHeader
            description="Keep enough credits ready for the videos you want to process next."
            title="Billing"
          />

          <section className="mt-9" aria-label="Credit balance">
            {balanceResult.kind === "success" ? (
              <CreditBalanceCard balance={balanceResult.balance} variant="full" />
            ) : (
              <CreditBalanceError message={balanceResult.message} />
            )}
          </section>

          <section className="mt-12" aria-labelledby="credit-packs-title">
            <div className="max-w-2xl">
              <h2
                className="text-2xl font-semibold tracking-[-0.04em] text-rp-text"
                id="credit-packs-title"
              >
                Credit packs
              </h2>
              <p className="mt-2 text-sm leading-6 text-rp-text-muted">
                One credit equals one video minute. Partial minutes round up.
              </p>
            </div>
            <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {CREDIT_PACKS.map((pack) => (
                <CreditPackCard key={pack.code} pack={pack} />
              ))}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
