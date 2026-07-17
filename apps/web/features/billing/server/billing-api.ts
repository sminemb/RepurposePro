import "server-only";

import type { ApiSuccess, CreditBalance, CreditPackCode } from "@repurposepro/shared";

import { requestApi } from "@/lib/server-api";

import { isStripeCheckoutUrl } from "../checkout-url";

export type CreditBalanceResult =
  | { readonly balance: CreditBalance; readonly kind: "success" }
  | { readonly kind: "unauthenticated" }
  | { readonly kind: "unavailable"; readonly message: string };

export type CheckoutSessionResult =
  | { readonly checkoutUrl: string; readonly kind: "success" }
  | { readonly kind: "unauthenticated" }
  | { readonly kind: "unavailable"; readonly message: string };

const unavailableMessage = "We could not load your credit balance. Refresh the page to try again.";
const checkoutUnavailableMessage = "Checkout is temporarily unavailable. Try again.";

function isCreditBalance(value: unknown): value is CreditBalance {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const balance = value as Partial<CreditBalance>;
  return (
    typeof balance.balance === "number" &&
    Number.isSafeInteger(balance.balance) &&
    balance.conversion === "1 credit = 1 video minute" &&
    balance.unit === "credits"
  );
}

export async function getCreditBalance(): Promise<CreditBalanceResult> {
  try {
    const response = await requestApi("/billing/credits");

    if (response.status === 401) {
      return { kind: "unauthenticated" };
    }

    if (!response.ok) {
      return { kind: "unavailable", message: unavailableMessage };
    }

    const body = (await response.json()) as ApiSuccess<unknown>;
    if (!isCreditBalance(body.data)) {
      return { kind: "unavailable", message: unavailableMessage };
    }

    return { balance: body.data, kind: "success" };
  } catch {
    return { kind: "unavailable", message: unavailableMessage };
  }
}

export async function createCheckoutSession(pack: CreditPackCode): Promise<CheckoutSessionResult> {
  try {
    const response = await requestApi("/billing/checkout", {
      body: JSON.stringify({ pack }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    if (response.status === 401) {
      return { kind: "unauthenticated" };
    }

    if (!response.ok) {
      return { kind: "unavailable", message: checkoutUnavailableMessage };
    }

    const body = (await response.json()) as ApiSuccess<unknown>;
    if (!isCheckoutSession(body.data)) {
      return { kind: "unavailable", message: checkoutUnavailableMessage };
    }

    return { checkoutUrl: body.data.checkoutUrl, kind: "success" };
  } catch {
    return { kind: "unavailable", message: checkoutUnavailableMessage };
  }
}

function isCheckoutSession(value: unknown): value is { readonly checkoutUrl: string } {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const session = value as Partial<{ readonly checkoutUrl: unknown }>;
  return isStripeCheckoutUrl(session.checkoutUrl);
}
