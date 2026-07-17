"use client";

import { useSearchParams } from "next/navigation";

export function CheckoutReturnNotice() {
  const checkoutStatus = useSearchParams().get("checkout");

  if (checkoutStatus === "success") {
    return (
      <p
        aria-live="polite"
        className="mt-6 rounded-rp-md border border-rp-primary/40 bg-rp-primary-soft/40 px-4 py-3 text-sm leading-6 text-rp-text"
        role="status"
      >
        Payment submitted. Confirmation is pending webhook processing; credits appear after Stripe
        confirms the payment.
      </p>
    );
  }

  if (checkoutStatus === "cancelled") {
    return (
      <p
        aria-live="polite"
        className="mt-6 rounded-rp-md border border-rp-border bg-rp-card px-4 py-3 text-sm leading-6 text-rp-text-muted"
        role="status"
      >
        Checkout was cancelled. No credits were added.
      </p>
    );
  }

  return null;
}
