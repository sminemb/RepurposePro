"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";

interface CreditBalanceErrorProps {
  readonly message: string;
}

export function CreditBalanceError({ message }: CreditBalanceErrorProps) {
  const router = useRouter();

  return (
    <section
      className="rounded-rp-lg border border-rp-danger/35 bg-rp-danger-soft/35 p-5 text-sm leading-6 text-rp-text"
      role="alert"
    >
      <p>{message}</p>
      <button
        className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-rp-md border border-rp-danger/45 px-4 text-sm font-semibold text-rp-text hover:bg-rp-danger-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rp-primary"
        onClick={() => router.refresh()}
        type="button"
      >
        <RefreshCw aria-hidden="true" className="size-4" /> Try again
      </button>
    </section>
  );
}
