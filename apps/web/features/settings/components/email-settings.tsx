"use client";

import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";

import { validateEmail } from "../validation";
import { FormFeedback, SettingsSection } from "./settings-section";
import { useSettingsSubmission } from "./use-settings-submission";

export function EmailSettings({
  email,
  emailVerified,
  emailAvailable,
  stage,
  callbackError,
}: {
  readonly email: string;
  readonly emailVerified: boolean;
  readonly emailAvailable: boolean;
  readonly stage?: string;
  readonly callbackError?: string;
}) {
  const [newEmail, setNewEmail] = useState("");
  const feedback = useSettingsSubmission();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const error = validateEmail(newEmail, email);
    if (error) {
      feedback.setError(error);
      return;
    }
    await feedback.run(
      () => authClient.changeEmail({ newEmail: newEmail.trim().toLowerCase() }),
      "Check your current inbox to approve the change. Then verify the new address. Your current email stays active until both steps are complete.",
    );
  }
  async function verifyCurrent() {
    await feedback.run(
      () => authClient.sendVerificationEmail({ email }),
      "Check your current inbox for a verification link. After verification, return here to request an email change.",
    );
  }
  const callbackMessage =
    stage === "current" && emailVerified
      ? "Your current email is verified. You can now request a change."
      : stage === "verified" && emailVerified
        ? `Your verified sign-in email is ${email}.`
        : stage === "approved"
          ? "To finish your change, follow the verification link sent to your proposed address. Your active email is shown below."
          : null;
  return (
    <SettingsSection
      title="Email and sign-in"
      description="Approve changes from your current inbox, then verify the new address."
    >
      <div className="grid gap-4">
        {callbackError ? (
          <p role="alert" className="text-sm text-rp-danger">
            {callbackError}
          </p>
        ) : callbackMessage ? (
          <p role="status" className="text-sm text-rp-text-muted">
            {callbackMessage}
          </p>
        ) : null}
        <div className="rounded-rp-md border border-rp-border bg-rp-bg p-4">
          <p className="text-xs font-medium text-rp-text-muted">Active sign-in email</p>
          <p className="mt-1 break-all text-sm font-medium text-rp-text">{email}</p>
        </div>
        {!emailAvailable ? (
          <p role="status" className="text-sm text-rp-text-muted">
            Email changes are temporarily unavailable. You can still update your name and password.
          </p>
        ) : null}
        {!emailVerified ? (
          <div className="grid justify-items-start gap-3">
            <p className="text-sm leading-6 text-rp-text-muted">
              First, verify your current email address. This is a one-time step before requesting a
              change.
            </p>
            <Button
              className="min-h-11 px-4"
              variant="outline"
              type="button"
              disabled={feedback.pending || !emailAvailable}
              onClick={verifyCurrent}
            >
              {feedback.pending ? "Sending verification…" : "Verify current email"}
            </Button>
          </div>
        ) : null}
        <form onSubmit={submit} className="grid gap-4" noValidate aria-label="Email">
          <div className="grid gap-2">
            <label htmlFor="settings-email" className="text-sm font-medium text-rp-text">
              New email address
            </label>
            <Input
              id="settings-email"
              name="newEmail"
              type="email"
              autoComplete="email"
              value={newEmail}
              onChange={(event) => setNewEmail(event.target.value)}
              required
              disabled={feedback.pending || !emailVerified || !emailAvailable}
              aria-invalid={Boolean(feedback.error)}
              aria-describedby="email-feedback email-help"
            />
          </div>
          <Button
            className="min-h-11 w-fit px-5"
            type="submit"
            disabled={feedback.pending || !emailVerified || !emailAvailable}
          >
            {feedback.pending ? "Sending approval…" : "Request email change"}
          </Button>
        </form>
        <FormFeedback id="email-feedback" {...feedback} />
        <p id="email-help" className="text-sm leading-6 text-rp-text-muted">
          You can retry an incomplete or expired request. If you cannot access your current inbox,
          contact support for help with your account.
        </p>
      </div>
    </SettingsSection>
  );
}
