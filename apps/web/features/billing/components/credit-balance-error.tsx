"use client";

import { CircleAlert, RefreshCw } from "lucide-react";
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
      <div className="flex items-start gap-3">
        <CircleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-rp-danger" />
        <div>
          <p className="font-semibold text-rp-danger">Could not load billing information</p>
          <p className="mt-1">{message}</p>
        </div>
      </div>
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
