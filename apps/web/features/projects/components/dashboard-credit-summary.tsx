import type { CreditBalance } from "@repurposepro/shared";

import { CreditBalanceCard } from "@/features/billing/components/credit-balance-card";

interface DashboardCreditSummaryProps {
  readonly balance: CreditBalance;
}

export function DashboardCreditSummary({ balance }: DashboardCreditSummaryProps) {
  return <CreditBalanceCard balance={balance} variant="compact" />;
}
