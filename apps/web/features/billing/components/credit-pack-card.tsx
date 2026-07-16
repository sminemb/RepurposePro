import type { CreditPack } from "@repurposepro/shared";

import { cn } from "@/lib/utils";

import { formatCreditPrice } from "./billing-format";

interface CreditPackCardProps {
  readonly pack: CreditPack;
}

export function CreditPackCard({ pack }: CreditPackCardProps) {
  const checkoutDescriptionId = `checkout-status-${pack.code}`;

  return (
    <article
      className={cn(
        "flex min-h-full flex-col rounded-rp-lg border bg-rp-card p-6 shadow-rp-card sm:p-7",
        pack.isRecommended
          ? "border-rp-primary bg-rp-primary-soft/35 shadow-rp-glow"
          : "border-rp-border",
      )}
    >
      <div className="flex min-h-6 items-center justify-between gap-3">
        <h3 className="text-lg font-semibold text-rp-text">{pack.name}</h3>
        {pack.isRecommended ? (
          <span className="rounded-full bg-rp-primary px-2.5 py-1 text-xs font-semibold text-rp-primary-foreground">
            Recommended
          </span>
        ) : null}
      </div>
      <p className="mt-6 text-4xl font-semibold tracking-[-0.06em] text-rp-text">
        {formatCreditPrice(pack.priceCents)}
      </p>
      <p className="mt-5 border-t border-rp-border pt-5 text-sm text-rp-text-muted">
        <span className="font-semibold text-rp-text">{pack.credits} credits</span> for up to{" "}
        {pack.credits} video minutes
      </p>
      <div className="mt-auto pt-7">
        <button
          aria-describedby={checkoutDescriptionId}
          className="min-h-11 w-full rounded-rp-md border border-rp-border bg-rp-bg/70 px-4 text-sm font-semibold text-rp-text-disabled"
          disabled
          type="button"
        >
          Checkout unavailable
        </button>
        <p className="mt-3 text-xs leading-5 text-rp-text-muted" id={checkoutDescriptionId}>
          Secure Stripe checkout will be available here soon.
        </p>
      </div>
    </article>
  );
}
