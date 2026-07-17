"use server";

import type { CreditPackCode } from "@repurposepro/shared";

import { createCheckoutSession } from "../server/billing-api";

interface CheckoutActionState {
  readonly checkoutUrl: string | null;
  readonly error: string | null;
}

const invalidPackMessage = "Choose a valid credit pack and try again.";
const unauthenticatedMessage = "Your session expired. Sign in again to continue.";

export async function startCheckout(
  _previousState: CheckoutActionState,
  formData: FormData,
): Promise<CheckoutActionState> {
  const pack = parseCreditPack(formData.get("pack"));
  if (!pack) {
    return { checkoutUrl: null, error: invalidPackMessage };
  }

  const result = await createCheckoutSession(pack);
  if (result.kind === "success") {
    return { checkoutUrl: result.checkoutUrl, error: null };
  }

  if (result.kind === "unauthenticated") {
    return { checkoutUrl: null, error: unauthenticatedMessage };
  }

  return { checkoutUrl: null, error: result.message };
}

function parseCreditPack(value: FormDataEntryValue | null): CreditPackCode | null {
  if (value === "starter" || value === "creator" || value === "pro") {
    return value;
  }

  return null;
}
