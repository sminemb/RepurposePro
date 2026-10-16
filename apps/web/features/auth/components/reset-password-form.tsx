"use client";

import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

import { formValue, validatePasswordConfirmation } from "../validation";
import { PasswordInput } from "./password-input";
import { RecoveryFeedback, RecoveryLink, recoveryError } from "./recovery-feedback";

export function ResetPasswordForm({
  token,
  invalid,
}: {
  readonly token?: string;
  readonly invalid: boolean;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unusable, setUnusable] = useState(invalid || !token);
  const [complete, setComplete] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !token) return;
    setError(null);
    const form = event.currentTarget;
    const data = new FormData(form);
    const newPassword = formValue(data, "password");
    const validationError = validatePasswordConfirmation(
      newPassword,
      formValue(data, "confirmPassword"),
    );
    if (validationError) {
      setError(validationError);
      return;
    }
    setPending(true);
    try {
      const response = await authClient.resetPassword({ newPassword, token });
      if (response.error) {
        if (response.error.code === "INVALID_TOKEN") setUnusable(true);
        else setError(recoveryError(response.error));
      } else {
        form.reset();
        window.history.replaceState(null, "", "/reset-password");
        setComplete(true);
      }
    } catch {
      setError("Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  if (complete)
    return (
      <div className="grid gap-5">
        <RecoveryFeedback message="Your password has been reset. All devices have been signed out. Sign in with your new password." />
        <RecoveryLink>Sign in</RecoveryLink>
      </div>
    );
  if (unusable)
    return (
      <div className="grid gap-5">
        <RecoveryFeedback
          error
          message="This password reset link is invalid, has expired, or has already been used. Request a new link to continue."
        />
        <RecoveryLink href="/forgot-password">Request a new reset link</RecoveryLink>
        <RecoveryLink />
      </div>
    );
  return (
    <form
      onSubmit={submit}
      className="grid gap-5"
      noValidate
      aria-describedby={error ? "recovery-feedback" : undefined}
    >
      <div className="grid gap-2">
        <label className="text-sm font-medium text-rp-text" htmlFor="new-password">
          New password
        </label>
        <PasswordInput
          id="new-password"
          name="password"
          autoComplete="new-password"
          required
          disabled={pending}
          visibilityLabel="new password"
          aria-describedby="password-help"
        />
        <p className="text-xs leading-5 text-rp-text-muted" id="password-help">
          Use between 8 and 128 characters.
        </p>
      </div>
      <div className="grid gap-2">
        <label className="text-sm font-medium text-rp-text" htmlFor="confirm-password">
          Confirm new password
        </label>
        <PasswordInput
          id="confirm-password"
          name="confirmPassword"
          autoComplete="new-password"
          required
          disabled={pending}
          visibilityLabel="confirm new password"
        />
      </div>
      {error ? <RecoveryFeedback error message={error} /> : null}
      <Button className="h-11" type="submit" disabled={pending} aria-busy={pending}>
        {pending ? "Resetting password" : "Reset password"}
      </Button>
      <RecoveryLink />
    </form>
  );
}
