"use client";

import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";

import { validatePassword } from "../validation";
import { FormFeedback, SettingsSection } from "./settings-section";
import { useSettingsSubmission } from "./use-settings-submission";

export function PasswordSettings() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const feedback = useSettingsSubmission();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const error = validatePassword(currentPassword, newPassword, confirmation);
    if (error) {
      feedback.setError(error);
      return;
    }
    if (
      await feedback.run(
        () =>
          authClient.changePassword({
            currentPassword,
            newPassword,
            revokeOtherSessions: true,
          }),
        "Password updated. Other sessions have been signed out.",
      )
    ) {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmation("");
    }
  }
  return (
    <SettingsSection
      title="Password"
      description="Changing your password signs out your other sessions. This session stays active."
    >
      <form onSubmit={submit} className="grid gap-4" noValidate aria-label="Password">
        <div className="grid gap-2">
          <label htmlFor="current-password" className="text-sm font-medium text-rp-text">
            Current password
          </label>
          <Input
            id="current-password"
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            disabled={feedback.pending}
            required
            aria-describedby="password-feedback"
            aria-invalid={Boolean(feedback.error)}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <label htmlFor="new-password" className="text-sm font-medium text-rp-text">
              New password
            </label>
            <Input
              id="new-password"
              name="newPassword"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              minLength={8}
              maxLength={128}
              disabled={feedback.pending}
              required
              aria-describedby="password-hint password-feedback"
              aria-invalid={Boolean(feedback.error)}
            />
          </div>
          <div className="grid gap-2">
            <label htmlFor="confirm-password" className="text-sm font-medium text-rp-text">
              Confirm new password
            </label>
            <Input
              id="confirm-password"
              name="confirmation"
              type="password"
              autoComplete="new-password"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              minLength={8}
              maxLength={128}
              disabled={feedback.pending}
              required
              aria-describedby="password-feedback"
              aria-invalid={Boolean(feedback.error)}
            />
          </div>
        </div>
        <p id="password-hint" className="text-sm text-rp-text-muted">
          Use 8–128 characters.
        </p>
        <Button className="min-h-11 w-fit px-5" type="submit" disabled={feedback.pending}>
          {feedback.pending ? "Changing password…" : "Change password"}
        </Button>
        <FormFeedback id="password-feedback" {...feedback} />
      </form>
    </SettingsSection>
  );
}
