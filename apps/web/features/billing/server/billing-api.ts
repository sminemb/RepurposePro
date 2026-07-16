import "server-only";

import type { ApiSuccess, CreditBalance } from "@repurposepro/shared";

import { requestApi } from "@/lib/server-api";

export type CreditBalanceResult =
  | { readonly balance: CreditBalance; readonly kind: "success" }
  | { readonly kind: "unauthenticated" }
  | { readonly kind: "unavailable"; readonly message: string };

const unavailableMessage = "We could not load your credit balance. Refresh the page to try again.";

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
