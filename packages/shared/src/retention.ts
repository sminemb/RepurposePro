export type ExpirationState = "normal" | "warning" | "urgent" | "expired";
export function expirationState(expiresAt: string, now = Date.now()): ExpirationState {
  const remaining = Date.parse(expiresAt) - now;
  if (!Number.isFinite(remaining) || remaining <= 0) return "expired";
  if (remaining < 3_600_000) return "urgent";
  return remaining < 86_400_000 ? "warning" : "normal";
}
