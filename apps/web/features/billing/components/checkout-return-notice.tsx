"use client";

import { CircleAlert, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";

import {
  checkoutReturnNoticeState,
  checkoutReturnUrlWithoutStatus,
} from "./checkout-return-notice-state";

export function CheckoutReturnNotice() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const noticeState = checkoutReturnNoticeState(searchParams.get("checkout"));

  const dismiss = () => {
    router.replace(checkoutReturnUrlWithoutStatus(pathname, searchParams.toString()));
  };

  useEffect(() => {
    if (noticeState !== "pending") {
      return;
    }

    const timeout = window.setTimeout(dismiss, 6_000);
    return () => window.clearTimeout(timeout);
  }, [noticeState, pathname, router, searchParams]);

  if (noticeState === "pending") {
    return (
      <section
        aria-live="polite"
        className="mt-6 flex items-start gap-3 rounded-rp-md border border-rp-warning/40 bg-rp-warning-soft/55 px-4 py-3 text-sm leading-6 text-rp-text"
        role="status"
      >
        <CircleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-rp-warning" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-rp-warning">Payment confirmation pending</p>
          <p className="mt-1">
            Stripe received your payment. Credits appear once confirmation finishes.
          </p>
        </div>
        <button
          aria-label="Dismiss payment confirmation notice"
          className="-mr-1 -mt-1 grid size-11 shrink-0 place-items-center rounded-rp-sm text-rp-warning transition-colors hover:bg-rp-warning-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rp-primary"
          onClick={dismiss}
          type="button"
        >
          <X aria-hidden="true" className="size-4" />
        </button>
      </section>
    );
  }

  if (noticeState === "cancelled") {
    return (
      <section
        aria-live="polite"
        className="mt-6 flex items-start gap-3 rounded-rp-md border border-rp-warning/40 bg-rp-warning-soft/55 px-4 py-3 text-sm leading-6 text-rp-text"
        role="status"
      >
        <CircleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-rp-warning" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-rp-warning">Checkout cancelled</p>
          <p className="mt-1">No payment was completed, so no credits were added.</p>
        </div>
        <button
          aria-label="Dismiss cancelled Checkout notice"
          className="-mr-1 -mt-1 grid size-11 shrink-0 place-items-center rounded-rp-sm text-rp-warning transition-colors hover:bg-rp-warning-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rp-primary"
          onClick={dismiss}
          type="button"
        >
          <X aria-hidden="true" className="size-4" />
        </button>
      </section>
    );
  }

  return null;
}
