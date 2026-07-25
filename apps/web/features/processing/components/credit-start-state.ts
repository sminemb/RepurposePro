export type CreditStartState =
  | { readonly kind: "unavailable"; readonly remainingBalance: null }
  | {
      readonly creditsShort: number;
      readonly kind: "insufficient";
      readonly remainingBalance: null;
    }
  | { readonly kind: "ready"; readonly remainingBalance: number };

export function getCreditStartState(
  currentBalance: number | null,
  requiredCredits: number,
): CreditStartState {
  if (currentBalance === null) {
    return { kind: "unavailable", remainingBalance: null };
  }

  if (currentBalance < requiredCredits) {
    return {
      creditsShort: requiredCredits - currentBalance,
      kind: "insufficient",
      remainingBalance: null,
    };
  }

  return { kind: "ready", remainingBalance: currentBalance - requiredCredits };
}
