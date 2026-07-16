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
