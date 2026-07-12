"use client";

import { CircleAlert, Eye, EyeOff, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";

import { getAuthResponseError } from "./auth-form-errors";
import type { AuthFormError } from "./auth-form-errors";

interface AuthFormProps {
  readonly mode: "login" | "signup";
}

function formValue(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function validateForm(formData: FormData, isSignUp: boolean): AuthFormError | null {
  if (isSignUp && !formValue(formData, "name").trim()) {
    return {
      title: "Your name is missing",
      message: "Add your name so we know what to call you.",
    };
  }

  const email = formValue(formData, "email").trim();
  if (!email) {
    return {
      title: "Your email is missing",
      message: "Add the email you use for your RepurposePro account.",
    };
  }

  if (!/^\S+@\S+\.\S+$/.test(email)) {
    return {
      title: "Check your email",
      message: "Use a valid email address to continue.",
    };
  }

  const password = formValue(formData, "password");
  if (!password) {
    return {
      title: "Your password is missing",
      message: "Enter your password to continue.",
    };
  }

  if (password.length < 8) {
    return {
      title: "Your password is too short",
      message: "Use at least 8 characters for your password.",
    };
  }

  return null;
}

export function AuthForm({ mode }: AuthFormProps) {
  const router = useRouter();
  const [error, setError] = useState<AuthFormError | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const isSignUp = mode === "signup";

  async function submit(formData: FormData) {
    setError(null);
    setIsPending(true);
    const validationError = validateForm(formData, isSignUp);
    if (validationError) {
      setError(validationError);
      setIsPending(false);
      return;
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
      });
      setIsPending(false);
      return;
    }
    if (response.error) {
      setError(getAuthResponseError(response.error, isSignUp));
      setIsPending(false);
      return;
    }
    router.replace("/dashboard");
    router.refresh();
  }

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
        <div className="relative">
          <Input
            aria-describedby={isSignUp ? "password-help" : undefined}
            autoComplete={isSignUp ? "new-password" : "current-password"}
            className="h-11 pr-12"
            disabled={isPending}
            id="password"
            minLength={8}
            name="password"
            required
            type={showPassword ? "text" : "password"}
          />
          <button
            aria-label={showPassword ? "Hide password" : "Show password"}
            aria-pressed={showPassword}
            className="absolute inset-y-0 right-0 grid min-w-11 place-items-center text-rp-text-muted hover:text-rp-text focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-rp-primary disabled:cursor-not-allowed disabled:opacity-50"
            disabled={isPending}
            type="button"
            onClick={() => setShowPassword((visible) => !visible)}
          >
            {showPassword ? (
              <EyeOff aria-hidden="true" className="size-4" />
            ) : (
              <Eye aria-hidden="true" className="size-4" />
            )}
          </button>
        </div>
        {isSignUp ? (
          <p className="text-xs leading-5 text-rp-text-muted" id="password-help">
            Use at least 8 characters.
          </p>
        ) : null}
      </div>
      {error ? (
        <div
          aria-live="assertive"
          className="flex items-start gap-3 rounded-rp-md border border-rp-danger/35 bg-rp-danger-soft/45 px-4 py-3.5"
          id="auth-error"
          role="alert"
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-rp-sm border border-rp-danger/30 bg-rp-danger/10 text-rp-danger">
            <CircleAlert aria-hidden="true" className="size-5" />
          </span>
          <div className="min-w-0 pt-0.5">
            <p className="text-sm font-semibold text-rp-text">{error.title}</p>
            <p className="mt-1 text-sm leading-5 text-rp-text-muted">{error.message}</p>
          </div>
        </div>
      ) : null}
      <Button
        className="h-11 bg-rp-primary text-rp-bg-deep hover:bg-rp-primary-hover"
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
