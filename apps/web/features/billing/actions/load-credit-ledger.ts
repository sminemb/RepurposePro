"use server";

import type { CreditLedgerPage } from "@repurposepro/shared";

import { getCreditLedger } from "../server/billing-api";

export interface LoadCreditLedgerState {
  readonly error: string | null;
  readonly page: CreditLedgerPage | null;
}

const invalidCursorMessage =
  "Credit history page is no longer available. Refresh the page to try again.";
const unauthenticatedMessage = "Your session expired. Sign in again to continue.";

export async function loadCreditLedger(
  _previousState: LoadCreditLedgerState,
  formData: FormData,
): Promise<LoadCreditLedgerState> {
  const cursor = formData.get("cursor");
  if (typeof cursor !== "string" || cursor.length === 0) {
    return { error: invalidCursorMessage, page: null };
  }

  const result = await getCreditLedger({ cursor });
  if (result.kind === "success") {
    return { error: null, page: result.page };
  }

  if (result.kind === "unauthenticated") {
    return { error: unauthenticatedMessage, page: null };
  }

  return { error: result.message, page: null };
}
