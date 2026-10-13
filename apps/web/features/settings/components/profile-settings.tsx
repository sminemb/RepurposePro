"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";

import { validateName } from "../validation";
import { FormFeedback, SettingsSection } from "./settings-section";
import { useSettingsSubmission } from "./use-settings-submission";

export function ProfileSettings({ name: initialName }: { readonly name: string }) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const feedback = useSettingsSubmission();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const error = validateName(name);
    if (error) {
      feedback.setError(error);
      return;
    }
    if (
      await feedback.run(
        () => authClient.updateUser({ name: name.trim() }),
        "Your name has been updated.",
      )
    ) {
      setName(name.trim());
      router.refresh();
    }
  }
  return (
    <SettingsSection title="Profile" description="The name shown in your workspace.">
      <form onSubmit={submit} className="grid gap-4" noValidate aria-label="Profile">
        <div className="grid gap-2">
          <label htmlFor="settings-name" className="text-sm font-medium text-rp-text">
            Account name
          </label>
          <Input
            id="settings-name"
            name="name"
            autoComplete="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            disabled={feedback.pending}
            aria-invalid={Boolean(feedback.error)}
            aria-describedby="profile-feedback"
          />
        </div>
        <Button className="min-h-11 w-fit px-5" type="submit" disabled={feedback.pending}>
          {feedback.pending ? "Saving name…" : "Save name"}
        </Button>
        <FormFeedback id="profile-feedback" {...feedback} />
      </form>
    </SettingsSection>
  );
}
