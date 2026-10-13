"use client";

import { useState } from "react";

const errors: Record<string, string> = {
  INVALID_PASSWORD: "Your current password is incorrect. Try again.",
  INVALID_CURRENT_PASSWORD: "Your current password is incorrect. Try again.",
  PASSWORD_TOO_SHORT: "Use at least 8 characters for your new password.",
  PASSWORD_TOO_LONG: "Use no more than 128 characters for your new password.",
  CURRENT_EMAIL_UNVERIFIED: "Verify your current email address before requesting a change.",
  EMAIL_UNAVAILABLE: "This email address is unavailable. Choose another address.",
  EMAIL_DELIVERY_UNAVAILABLE: "Email delivery is temporarily unavailable. Please try again later.",
  EMAIL_DELIVERY_FAILED: "We could not send the email. Please try again.",
  SESSION_EXPIRED: "Your session has expired. Sign in again to continue.",
  FRESH_SESSION_REQUIRED: "Sign in again before changing your email address.",
  RATE_LIMIT_EXCEEDED: "Too many attempts. Wait a few minutes and try again.",
  PROTECTION_UNAVAILABLE: "This action is temporarily unavailable. Please try again.",
  REQUEST_BLOCKED: "We could not verify this request. Refresh the page and try again.",
};

export function useSettingsSubmission() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  async function run(
    operation: () => Promise<{ error?: { code?: string; status?: number } | null }>,
    success: string,
  ) {
    setPending(true);
    setError(null);
    setMessage(null);
    try {
      const response = await operation();
      if (response.error) {
        const code = response.error.code ?? "";
        setError(
          (Object.hasOwn(errors, code) ? errors[code] : undefined) ??
            (response.error.status === 401
              ? "Sign in again to continue."
              : "We could not save this change. Please try again."),
        );
        return false;
      }
      setMessage(success);
      return true;
    } catch {
      setError("Check your connection and try again.");
      return false;
    } finally {
      setPending(false);
    }
  }
  return { pending, error, message, run, setError };
}
