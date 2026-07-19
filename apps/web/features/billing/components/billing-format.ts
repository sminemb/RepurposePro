import type { CreditLedgerType } from "@repurposepro/shared";

export function availableProcessingMinutes(balance: number): number {
  return Math.max(0, balance);
}

export function formatCreditPrice(priceCents: number): string {
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
    style: "currency",
  }).format(priceCents / 100);
}

export function formatCreditLedgerAmount(amount: number): string {
  return `${amount > 0 ? "+" : ""}${amount} credits`;
}

export function formatCreditLedgerType(type: CreditLedgerType): string {
  return {
    expiration_adjustment: "Expiration adjustment",
    manual_adjustment: "Manual adjustment",
    processing_deduction: "Processing charge",
    purchase: "Credit purchase",
    refund: "Credit refund",
  }[type];
}
