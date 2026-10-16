import Link from "next/link";

export function RecoveryFeedback({
  message,
  error = false,
}: {
  readonly message: string;
  readonly error?: boolean;
}) {
  return (
    <p
      className={`rounded-rp-md border px-4 py-3 text-sm leading-6 ${error ? "border-rp-danger/35 bg-rp-danger-soft/45 text-rp-danger" : "border-rp-border bg-rp-surface text-rp-text"}`}
      id="recovery-feedback"
      role={error ? "alert" : "status"}
    >
      {message}
    </p>
  );
}

export function RecoveryLink({
  href = "/login",
  children = "Back to sign in",
}: {
  readonly href?: string;
  readonly children?: React.ReactNode;
}) {
  return (
    <Link
      className="justify-self-center text-sm text-rp-primary hover:text-rp-primary-hover"
      href={href}
    >
      {children}
    </Link>
  );
}

export function recoveryError(
  error: { readonly code?: string; readonly status?: number } | undefined,
): string {
  if (error?.status === 429 || error?.code === "RATE_LIMIT_EXCEEDED")
    return "Too many attempts. Wait 10 minutes, then try again.";
  if (error?.code === "EMAIL_DELIVERY_UNAVAILABLE")
    return "Email delivery is unavailable. Please try again later.";
  if (error?.code === "REQUEST_BLOCKED")
    return "Security protection blocked this request. Please try again using your browser.";
  if (error?.code === "PROTECTION_UNAVAILABLE")
    return "Password recovery is temporarily unavailable. Please try again shortly.";
  return "We could not complete your request. Please try again.";
}
