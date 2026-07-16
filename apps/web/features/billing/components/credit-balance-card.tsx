import type { CreditBalance } from "@repurposepro/shared";
import { Coins } from "lucide-react";
import Link from "next/link";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import { availableProcessingMinutes } from "./billing-format";

interface CreditBalanceCardProps {
  readonly balance: CreditBalance;
  readonly className?: string;
  readonly variant: "compact" | "full";
}

export function CreditBalanceCard({ balance, className, variant }: CreditBalanceCardProps) {
  const availableMinutes = availableProcessingMinutes(balance.balance);
  const negativeBalance = balance.balance < 0;

  return (
    <Card
      className={cn(
        "border border-rp-border bg-rp-card text-rp-text shadow-rp-card",
        variant === "compact" ? "gap-0 py-0" : "overflow-visible",
        className,
      )}
    >
      <CardContent className={cn("p-5", variant === "full" ? "sm:p-7" : "")}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold tracking-[0.14em] text-rp-text-muted uppercase">
              Credit balance
            </p>
            <p className="mt-3 text-4xl font-semibold tracking-[-0.06em] text-rp-text sm:text-5xl">
              {balance.balance}
              <span className="ml-2 text-base font-medium tracking-normal text-rp-text-muted">
                credits
              </span>
            </p>
          </div>
          <span className="grid size-11 shrink-0 place-items-center rounded-rp-md border border-rp-primary/30 bg-rp-primary-soft text-rp-primary">
            <Coins aria-hidden="true" className="size-5" />
          </span>
        </div>
        <p className="mt-4 text-sm leading-6 text-rp-text-muted">
          {availableMinutes} {availableMinutes === 1 ? "minute" : "minutes"} available to process
        </p>
        {negativeBalance ? (
          <p className="mt-2 text-sm leading-6 text-rp-danger" role="status">
            Your balance is negative. Available processing minutes remain at 0.
          </p>
        ) : null}
        {variant === "full" ? (
          <p className="mt-5 border-t border-rp-border pt-4 text-sm leading-6 text-rp-text-muted">
            {balance.conversion}
          </p>
        ) : (
          <Link
            className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold text-rp-primary hover:text-rp-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rp-primary"
            href="/billing"
          >
            Buy credits
          </Link>
        )}
      </CardContent>
    </Card>
  );
}
