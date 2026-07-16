"use client";

import { Check, Clapperboard, FileVideo, LoaderCircle } from "lucide-react";
import { useActionState, useState } from "react";

import { createProjectAction } from "../actions/create-project";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const outputTypes = [
  {
    description: "Find the strongest vertical moments after your video is uploaded.",
    icon: Clapperboard,
    label: "Short clips",
    value: "clips",
  },
  {
    description: "Create a focused chronological version of your full conversation.",
    icon: FileVideo,
    label: "Summary video",
    value: "summary",
  },
] as const;

const initialCreateProjectFormState: { readonly error: string | null } = { error: null };

export function NewProjectForm() {
  const [selectedOutputType, setSelectedOutputType] =
    useState<(typeof outputTypes)[number]["value"]>("clips");
  const [state, formAction, isPending] = useActionState(
    createProjectAction,
    initialCreateProjectFormState,
  );

  return (
    <form action={formAction} className="grid gap-8" noValidate>
      <div className="grid gap-2">
        <label className="text-sm font-medium text-rp-text" htmlFor="project-name">
          Project name
        </label>
        <Input
          autoComplete="off"
          className="h-12 bg-rp-surface px-4"
          disabled={isPending}
          id="project-name"
          maxLength={120}
          name="name"
          placeholder="e.g. Creator burnout conversation"
          required
        />
        <p className="text-xs leading-5 text-rp-text-muted">
          Use a clear name you will recognize later.
        </p>
      </div>

      <fieldset className="grid gap-3">
        <legend className="text-sm font-medium text-rp-text">
          What should this project create?
        </legend>
        <p className="text-xs leading-5 text-rp-text-muted">
          You can select one output type for this project.
        </p>
        <div className="mt-1 grid gap-3 sm:grid-cols-2">
          {outputTypes.map(({ description, icon: Icon, label, value }) => {
            const selected = selectedOutputType === value;
            return (
              <label
                className={cn(
                  "relative flex min-h-44 cursor-pointer flex-col rounded-rp-lg border p-5 transition-colors focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-rp-primary",
                  selected
                    ? "border-rp-primary bg-rp-primary-soft/45"
                    : "border-rp-border bg-rp-surface/65 hover:border-rp-primary/50 hover:bg-rp-card",
                )}
                key={value}
              >
                <input
                  checked={selected}
                  className="sr-only"
                  disabled={isPending}
                  name="outputType"
                  type="radio"
                  value={value}
                  onChange={() => setSelectedOutputType(value)}
                />
                <span className="flex items-start justify-between gap-4">
                  <span className="grid size-11 place-items-center rounded-rp-md border border-rp-primary/25 bg-rp-primary-soft text-rp-primary">
                    <Icon aria-hidden="true" className="size-5" />
                  </span>
                  <span
                    aria-hidden="true"
                    className={cn(
                      "grid size-6 place-items-center rounded-full border",
                      selected
                        ? "border-rp-primary bg-rp-primary text-rp-primary-foreground"
                        : "border-rp-border-strong",
                    )}
                  >
                    {selected ? <Check className="size-4" /> : null}
                  </span>
                </span>
                <span className="mt-5 text-base font-semibold text-rp-text">{label}</span>
                <span className="mt-2 text-sm leading-6 text-rp-text-muted">{description}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {state.error ? (
        <div
          aria-live="assertive"
          className="rounded-rp-md border border-rp-danger/35 bg-rp-danger-soft/45 px-4 py-3 text-sm leading-6 text-rp-text"
          role="alert"
        >
          {state.error}
        </div>
      ) : null}

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs leading-5 text-rp-text-muted">
          You will upload your source video in the next step.
        </p>
        <button
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-rp-md bg-rp-primary px-5 text-sm font-semibold text-rp-primary-foreground transition-colors hover:bg-rp-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rp-primary disabled:cursor-not-allowed disabled:opacity-50"
          disabled={isPending}
          type="submit"
        >
          {isPending ? (
            <LoaderCircle
              aria-hidden="true"
              className="size-4 animate-spin motion-reduce:animate-none"
            />
          ) : null}
          {isPending ? "Creating project" : "Create project"}
        </button>
      </div>
    </form>
  );
}
