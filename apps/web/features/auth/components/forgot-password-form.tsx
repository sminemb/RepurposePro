"use client";

import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";

import { formValue } from "../validation";
import { RecoveryFeedback, RecoveryLink, recoveryError } from "./recovery-feedback";

export function ForgotPasswordForm() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setError(null);
    const email = formValue(new FormData(event.currentTarget), "email").trim();
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setError("Enter a valid email address.");
      return;
    }
    setPending(true);
    try {
      const response = await authClient.requestPasswordReset({
        email,
        redirectTo: "/reset-password",
      });
      if (response.error) setError(recoveryError(response.error));
      else setSent(true);
    } catch {
      setError("Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="grid gap-5">
      {sent ? (
        <>
          <RecoveryFeedback message="If an account exists for this email, you’ll receive a password reset link. The link expires in one hour." />
          <button
            className="text-sm text-rp-primary hover:text-rp-primary-hover"
            type="button"
            onClick={() => setSent(false)}
          >
            Try another email
          </button>
        </>
      ) : (
        <form
          onSubmit={submit}
          className="grid gap-5"
          noValidate
          aria-describedby={error ? "recovery-feedback" : undefined}
        >
          <div className="grid gap-2">
            <label className="text-sm font-medium text-rp-text" htmlFor="recovery-email">
              Email
            </label>
            <Input
              id="recovery-email"
              name="email"
              type="email"
              autoComplete="email"
              required
              disabled={pending}
            />
          </div>
          {error ? <RecoveryFeedback error message={error} /> : null}
          <Button className="h-11" type="submit" disabled={pending} aria-busy={pending}>
            {pending ? "Sending reset link" : "Send reset link"}
          </Button>
        </form>
      )}
      <RecoveryLink />
    </div>
  );
}
