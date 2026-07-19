export interface CreditBalance {
  readonly balance: number;
  readonly conversion: "1 credit = 1 video minute";
  readonly unit: "credits";
}

export type CreditLedgerType =
  "purchase" | "processing_deduction" | "refund" | "manual_adjustment" | "expiration_adjustment";

export interface CreditLedgerEntry {
  readonly amount: number;
  readonly createdAt: string;
  readonly description: string;
  readonly id: string;
  readonly projectId: string | null;
  readonly type: CreditLedgerType;
}

export interface CreditLedgerPage {
  readonly data: readonly CreditLedgerEntry[];
  readonly meta: {
    readonly nextCursor: string | null;
  };
}

export type CreditPackCode = "starter" | "creator" | "pro";

export interface CreditPack {
  readonly code: CreditPackCode;
  readonly credits: number;
  readonly currency: "USD";
  readonly displayOrder: number;
  readonly isRecommended: boolean;
  readonly name: string;
  readonly priceCents: number;
}

export const CREDIT_PACKS = [
  {
    code: "starter",
    credits: 40,
    currency: "USD",
    displayOrder: 1,
    isRecommended: false,
    name: "Starter",
    priceCents: 1000,
  },
  {
    code: "creator",
    credits: 100,
    currency: "USD",
    displayOrder: 2,
    isRecommended: true,
    name: "Creator",
    priceCents: 2500,
  },
  {
    code: "pro",
    credits: 200,
    currency: "USD",
    displayOrder: 3,
    isRecommended: false,
    name: "Pro",
    priceCents: 5000,
  },
] as const satisfies readonly CreditPack[];
