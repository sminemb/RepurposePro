"use client";

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
  const isSignUp = mode === "signup";

  async function submit(formData: FormData) {
    setError(null);
    setIsPending(true);
    const email = formValue(formData, "email").trim();
    const password = formValue(formData, "password");
    const response = isSignUp
      ? await authClient.signUp.email({ email, name: formValue(formData, "name").trim(), password })
      : await authClient.signIn.email({ email, password });
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
    <form action={submit} className="grid gap-5">
      {isSignUp ? (
        <div className="grid gap-2">
          <label className="text-sm font-medium text-rp-text" htmlFor="name">
            Name
          </label>
          <Input autoComplete="name" id="name" name="name" required />
        </div>
      ) : null}
      <div className="grid gap-2">
        <label className="text-sm font-medium text-rp-text" htmlFor="email">
          Email
        </label>
        <Input autoComplete="email" id="email" name="email" required type="email" />
      </div>
      <div className="grid gap-2">
        <label className="text-sm font-medium text-rp-text" htmlFor="password">
          Password
        </label>
        <Input
          autoComplete={isSignUp ? "new-password" : "current-password"}
          id="password"
          minLength={8}
          name="password"
          required
          type="password"
        />
      </div>
      {error ? (
        <p
          aria-live="polite"
          className="rounded-rp-sm border border-rp-danger/30 bg-rp-danger-soft px-3 py-2 text-sm text-rp-danger"
        >
          {error}
        </p>
      ) : null}
      <Button
        className="h-11 bg-rp-primary text-rp-text hover:bg-rp-primary-hover"
        disabled={isPending}
        type="submit"
      >
        {isPending ? "Please wait" : isSignUp ? "Create account" : "Sign in"}
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
