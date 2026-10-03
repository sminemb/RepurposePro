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
  readonly reason?: { isRateLimit(): boolean; readonly resetTime?: Date | number };
  readonly conclusion?: string;
  readonly results?: readonly { state?: string; conclusion?: string }[];
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
      decision.isErrored() ||
      decision.results?.some((result) => result.conclusion === "ERROR")
    )
      return unavailable;
    if (!decision.isDenied() && decision.conclusion !== "CHALLENGE") return null;
    if (decision.reason?.isRateLimit()) {
      const rawReset = decision.reason.resetTime;
      const reset = rawReset instanceof Date ? rawReset.getTime() / 1000 : rawReset;
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

export function protectionOutcome(value: unknown): string {
  const failure = protectionFailure(value);
  if (failure) return failure.code;
  const decision = value as ProtectionDecision;
  return decision.results?.some(
    (result) => result.state === "DRY_RUN" && result.conclusion === "DENY",
  )
    ? "dry_run_denied"
    : "allowed";
}

export function protectionRetryMessage(
  code: string | undefined,
  action: string,
  retryAfter?: string | null,
): string | undefined {
  if (code === "RATE_LIMIT_EXCEEDED") {
    const seconds = Number(retryAfter);
    const wait =
      Number.isSafeInteger(seconds) && seconds > 0 && seconds <= 600
        ? `${seconds} seconds`
        : "a minute";
    return `Too many attempts. Wait ${wait} and try again.`;
  }
  if (
    [
      "PROTECTION_UNAVAILABLE",
      "PROCESSING_START_UNAVAILABLE",
      "BILLING_CHECKOUT_UNAVAILABLE",
    ].includes(code ?? "")
  )
    return `${action} is temporarily unavailable. Try again shortly.`;
  if (code === "REQUEST_BLOCKED")
    return "We could not verify this request. Refresh the page and try again.";
  return undefined;
}
