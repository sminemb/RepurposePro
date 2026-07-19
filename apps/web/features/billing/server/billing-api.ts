import "server-only";

import type {
  ApiSuccess,
  CreditBalance,
  CreditLedgerEntry,
  CreditLedgerPage,
  CreditLedgerType,
  CreditPackCode,
} from "@repurposepro/shared";

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

export type CreditLedgerResult =
  | { readonly kind: "success"; readonly page: CreditLedgerPage }
  | { readonly kind: "unauthenticated" }
  | { readonly kind: "unavailable"; readonly message: string };

const unavailableMessage = "We could not load your credit balance. Refresh the page to try again.";
const checkoutUnavailableMessage = "Checkout is temporarily unavailable. Try again.";
const ledgerUnavailableMessage =
  "We could not load your credit history. Refresh the page to try again.";
const creditLedgerTypes: readonly CreditLedgerType[] = [
  "purchase",
  "processing_deduction",
  "refund",
  "manual_adjustment",
  "expiration_adjustment",
];

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

export async function getCreditLedger(
  input: { readonly cursor?: string } = {},
): Promise<CreditLedgerResult> {
  const query = input.cursor ? `?${new URLSearchParams({ cursor: input.cursor }).toString()}` : "";

  try {
    const response = await requestApi(`/billing/ledger${query}`);

    if (response.status === 401) {
      return { kind: "unauthenticated" };
    }

    if (!response.ok) {
      return { kind: "unavailable", message: ledgerUnavailableMessage };
    }

    const body = (await response.json()) as CreditLedgerPage;
    if (!isCreditLedgerPage(body)) {
      return { kind: "unavailable", message: ledgerUnavailableMessage };
    }

    return { kind: "success", page: body };
  } catch {
    return { kind: "unavailable", message: ledgerUnavailableMessage };
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

function isCreditLedgerEntry(value: unknown): value is CreditLedgerEntry {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const entry = value as Partial<CreditLedgerEntry>;
  return (
    typeof entry.amount === "number" &&
    Number.isSafeInteger(entry.amount) &&
    entry.amount !== 0 &&
    typeof entry.createdAt === "string" &&
    Number.isFinite(Date.parse(entry.createdAt)) &&
    typeof entry.description === "string" &&
    typeof entry.id === "string" &&
    entry.id.length > 0 &&
    (entry.projectId === null || typeof entry.projectId === "string") &&
    typeof entry.type === "string" &&
    creditLedgerTypes.includes(entry.type)
  );
}

function isCreditLedgerPage(value: unknown): value is CreditLedgerPage {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const page = value as Partial<CreditLedgerPage>;
  return (
    Array.isArray(page.data) &&
    page.data.every(isCreditLedgerEntry) &&
    typeof page.meta === "object" &&
    page.meta !== null &&
    (page.meta as { nextCursor?: unknown }).nextCursor !== undefined &&
    ((page.meta as { nextCursor?: unknown }).nextCursor === null ||
      typeof (page.meta as { nextCursor?: unknown }).nextCursor === "string")
  );
}
