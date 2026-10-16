"use client";

import { CircleAlert, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";

import { formValue, validatePasswordConfirmation } from "../validation";
import { getAuthResponseError } from "./auth-form-errors";
import type { AuthFormError } from "./auth-form-errors";
import { PasswordInput } from "./password-input";

interface AuthFormProps {
  readonly mode: "login" | "signup";
}

const feedbackStyles = {
  error: {
    icon: "border-rp-danger/30 bg-rp-danger/10 text-rp-danger",
    surface: "border-rp-danger/35 bg-rp-danger-soft/45",
    title: "text-rp-danger",
  },
  warning: {
    icon: "border-rp-warning/30 bg-rp-warning/10 text-rp-warning",
    surface: "border-rp-warning/40 bg-rp-warning-soft/55",
    title: "text-rp-warning",
  },
} as const;

function validateForm(formData: FormData, isSignUp: boolean): AuthFormError | null {
  if (isSignUp && !formValue(formData, "name").trim()) {
    return {
      title: "Your name is missing",
      message: "Add your name so we know what to call you.",
      variant: "warning",
    };
  }

  const email = formValue(formData, "email").trim();
  if (!email) {
    return {
      title: "Your email is missing",
      message: "Add the email you use for your RepurposePro account.",
      variant: "warning",
    };
  }

  if (!/^\S+@\S+\.\S+$/.test(email)) {
    return {
      title: "Check your email",
      message: "Use a valid email address to continue.",
      variant: "warning",
    };
  }

  const password = formValue(formData, "password");
  if (!password) {
    return {
      title: "Your password is missing",
      message: "Enter your password to continue.",
      variant: "warning",
    };
  }

  if (password.length < 8) {
    return {
      title: "Your password is too short",
      message: "Use at least 8 characters for your password.",
      variant: "warning",
    };
  }

  if (isSignUp) {
    const message = validatePasswordConfirmation(password, formValue(formData, "confirmPassword"));
    if (message) return { title: "Check your password", message, variant: "warning" };
  }

  return null;
}

export function AuthForm({ mode }: AuthFormProps) {
  const router = useRouter();
  const [error, setError] = useState<AuthFormError | null>(null);
  const isSignUp = mode === "signup";
  const feedbackStyle = error ? feedbackStyles[error.variant] : null;

  const [, submit, isPending] = useActionState(async (_previousState: null, formData: FormData) => {
    setError(null);
    const validationError = validateForm(formData, isSignUp);
    if (validationError) {
      setError(validationError);
      return null;
    }
    const email = formValue(formData, "email").trim();
    const password = formValue(formData, "password");
    const response = await (
      isSignUp
        ? authClient.signUp.email({ email, name: formValue(formData, "name").trim(), password })
        : authClient.signIn.email({ email, password })
    ).catch(() => null);
    if (!response) {
      setError({
        title: "RepurposePro is unreachable",
        message: "Check your connection and try again.",
        variant: "error",
      });
      return null;
    }
    if (response.error) {
      setError(getAuthResponseError(response.error, isSignUp));
      return null;
    }
    router.replace("/dashboard");
    router.refresh();
    return null;
  }, null);

  return (
    <form
      action={submit}
      aria-describedby={error ? "auth-error" : undefined}
      className="grid gap-5"
      noValidate
    >
      {isSignUp ? (
        <div className="grid gap-2">
          <label className="text-sm font-medium text-rp-text" htmlFor="name">
            Name
          </label>
          <Input autoComplete="name" disabled={isPending} id="name" name="name" required />
        </div>
      ) : null}
      <div className="grid gap-2">
        <label className="text-sm font-medium text-rp-text" htmlFor="email">
          Email
        </label>
        <Input
          autoComplete="email"
          disabled={isPending}
          id="email"
          name="email"
          required
          type="email"
        />
      </div>
      <div className="grid gap-2">
        <label className="text-sm font-medium text-rp-text" htmlFor="password">
          Password
        </label>
        <PasswordInput
          aria-describedby={isSignUp ? "password-help" : undefined}
          autoComplete={isSignUp ? "new-password" : "current-password"}
          disabled={isPending}
          id="password"
          minLength={8}
          name="password"
          required
        />
        {isSignUp ? (
          <p className="text-xs leading-5 text-rp-text-muted" id="password-help">
            Use between 8 and 128 characters.
          </p>
        ) : null}
      </div>
      {isSignUp ? (
        <div className="grid gap-2">
          <label className="text-sm font-medium text-rp-text" htmlFor="confirm-password">
            Confirm password
          </label>
          <PasswordInput
            autoComplete="new-password"
            disabled={isPending}
            id="confirm-password"
            name="confirmPassword"
            required
            visibilityLabel="confirm password"
          />
        </div>
      ) : (
        <Link
          className="justify-self-end text-sm text-rp-primary hover:text-rp-primary-hover"
          href="/forgot-password"
        >
          Forgot password?
        </Link>
      )}
      {error ? (
        <div
          aria-live="assertive"
          className={`flex items-start gap-3 rounded-rp-md border px-4 py-3.5 ${feedbackStyle?.surface}`}
          id="auth-error"
          role="alert"
        >
          <span
            className={`grid size-9 shrink-0 place-items-center rounded-rp-sm border ${feedbackStyle?.icon}`}
          >
            <CircleAlert aria-hidden="true" className="size-5" />
          </span>
          <div className="min-w-0 pt-0.5">
            <p className={`text-sm font-semibold ${feedbackStyle?.title}`}>{error.title}</p>
            <p className="mt-1 text-sm leading-5 text-rp-text-muted">{error.message}</p>
          </div>
        </div>
      ) : null}
      <Button
        aria-busy={isPending}
        className="h-11 bg-rp-primary text-rp-primary-foreground hover:bg-rp-primary-hover"
        disabled={isPending}
        type="submit"
      >
        {isPending ? (
          <>
            <LoaderCircle
              aria-hidden="true"
              className="size-4 animate-spin motion-reduce:animate-none"
            />
            {isSignUp ? "Creating account" : "Signing in"}
          </>
        ) : isSignUp ? (
          "Create account"
        ) : (
          "Sign in"
        )}
      </Button>
      <p className="text-center text-sm text-rp-text-muted">
        {isSignUp ? "Already have an account?" : "New to RepurposePro?"}{" "}
        <Link
          className="text-rp-primary hover:text-rp-primary-hover"
          href={isSignUp ? "/login" : "/signup"}
        >
          {isSignUp ? "Sign in" : "Create one"}
        </Link>
      </p>
    </form>
  );
}
