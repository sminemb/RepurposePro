"use client";

import type { CreditPack } from "@repurposepro/shared";
import { LoaderCircle } from "lucide-react";
import { useActionState, useEffect } from "react";

import { cn } from "@/lib/utils";

import { startCheckout } from "../actions/start-checkout";
import { formatCreditPrice } from "./billing-format";
import { isStripeCheckoutUrl } from "../checkout-url";

interface CreditPackCardProps {
  readonly pack: CreditPack;
}

export function CreditPackCard({ pack }: CreditPackCardProps) {
  const checkoutDescriptionId = `checkout-status-${pack.code}`;
  const [checkoutState, checkoutAction, isPending] = useActionState(startCheckout, {
    checkoutUrl: null,
    error: null,
  });

  useEffect(() => {
    if (isStripeCheckoutUrl(checkoutState.checkoutUrl)) {
      window.location.assign(checkoutState.checkoutUrl);
    }
  }, [checkoutState.checkoutUrl]);

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
        <form action={checkoutAction}>
          <input name="pack" type="hidden" value={pack.code} />
          <button
            aria-describedby={checkoutDescriptionId}
            className="min-h-11 w-full rounded-rp-md bg-rp-primary px-4 text-sm font-semibold text-rp-primary-foreground transition-colors hover:bg-rp-primary-hover disabled:cursor-not-allowed disabled:opacity-70"
            disabled={isPending}
            type="submit"
          >
            {isPending ? (
              <span className="inline-flex items-center justify-center gap-2">
                <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
                Opening secure checkout
              </span>
            ) : (
              "Buy credits"
            )}
          </button>
        </form>
        <p className="mt-3 text-xs leading-5 text-rp-text-muted" id={checkoutDescriptionId}>
          {checkoutState.error ?? "Secure payment is handled by Stripe."}
        </p>
        {checkoutState.error ? (
          <p aria-live="assertive" className="mt-2 text-xs leading-5 text-rp-danger" role="alert">
            {checkoutState.error}
          </p>
        ) : null}
      </div>
    </article>
  );
}
