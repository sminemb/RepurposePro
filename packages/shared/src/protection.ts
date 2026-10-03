export const protectionPolicies = {
  signup: { max: 5, window: "10m" },
  login: { max: 10, window: "1m" },
  project: { max: 10, window: "1m" },
  upload: { max: 3, window: "1m" },
  analyze: { max: 3, window: "1m" },
  checkout: { max: 3, window: "1m" },
  render: { max: 3, window: "1m" },
  regenerate: { max: 3, window: "1m" },
  framing: { max: 3, window: "1m" },
} as const;
export type ProtectionAction = keyof typeof protectionPolicies;
export interface ProtectionFailure {
  readonly code: "PROTECTION_UNAVAILABLE" | "REQUEST_BLOCKED" | "RATE_LIMIT_EXCEEDED";
  readonly message: string;
  readonly status: 403 | 429 | 503;
  readonly retryAfter?: number;
}
export interface ProtectionDecision {
  isDenied(): boolean;
  isErrored(): boolean;
  readonly reason?: { isRateLimit(): boolean; readonly resetTime?: number };
}
export function protectionFailure(value: unknown, now = Date.now()): ProtectionFailure | null {
  const unavailable: ProtectionFailure = {
    code: "PROTECTION_UNAVAILABLE",
    message: "This action is temporarily unavailable. Please try again.",
    status: 503,
  };
  try {
    const decision = value as ProtectionDecision | null;
    if (
      !decision ||
      typeof decision.isDenied !== "function" ||
      typeof decision.isErrored !== "function" ||
      decision.isErrored()
    )
      return unavailable;
    if (!decision.isDenied()) return null;
    if (decision.reason?.isRateLimit()) {
      const reset = decision.reason.resetTime;
      const retryAfter =
        typeof reset === "number" && Number.isFinite(reset)
          ? Math.max(1, Math.min(600, Math.ceil(reset - now / 1000)))
          : 60;
      return {
        code: "RATE_LIMIT_EXCEEDED",
        message: "Too many attempts. Please wait before trying again.",
        status: 429,
        retryAfter,
      };
    }
    return {
      code: "REQUEST_BLOCKED",
      message: "This request was blocked by our security protection.",
      status: 403,
    };
  } catch {
    return unavailable;
  }
}
