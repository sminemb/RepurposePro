"use client";

import { Eye, EyeOff, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";

interface AuthFormProps {
  readonly mode: "login" | "signup";
}

function formValue(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

export function AuthForm({ mode }: AuthFormProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const isSignUp = mode === "signup";

  async function submit(formData: FormData) {
    setError(null);
    setIsPending(true);
    const email = formValue(formData, "email").trim();
    const password = formValue(formData, "password");
    const response = await (
      isSignUp
        ? authClient.signUp.email({ email, name: formValue(formData, "name").trim(), password })
        : authClient.signIn.email({ email, password })
    ).catch(() => null);
    if (!response) {
      setError("We could not reach RepurposePro. Check your connection and try again.");
      setIsPending(false);
      return;
    }
    if (response.error) {
      setError(
        isSignUp
          ? "We could not create that account. Check your details or sign in instead."
          : "That email or password is not correct.",
      );
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
        <p
          aria-live="assertive"
          className="rounded-rp-sm border border-rp-danger/30 bg-rp-danger-soft px-3 py-2 text-sm text-rp-danger"
          id="auth-error"
          role="alert"
        >
          {error}
        </p>
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
