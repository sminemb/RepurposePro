import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { CREDIT_PACKS } from "@repurposepro/shared";

import { BrandMark } from "@/components/app/brand-mark";

interface SessionAwareProps {
  readonly isAuthenticated: boolean;
}

function formatPrice(priceCents: number): string {
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
    style: "currency",
  }).format(priceCents / 100);
}

export function PricingSection({ isAuthenticated }: SessionAwareProps) {
  return (
    <section className="py-24 sm:py-32" id="pricing">
      <div className="mx-auto max-w-7xl px-5 sm:px-8 lg:px-10">
        <div className="text-center">
          <h2 className="text-4xl font-semibold tracking-[-0.055em] sm:text-5xl">
            Pay for the minutes you process.
          </h2>
          <p className="mt-4 text-xl font-semibold text-rp-primary">$0.25 per video minute</p>
        </div>
        <div className="mx-auto mt-14 grid max-w-5xl items-center gap-4 md:grid-cols-[0.9fr_1.1fr_0.9fr]">
          {CREDIT_PACKS.map((pack) => (
            <article
              className={
                pack.isRecommended
                  ? "rounded-rp-lg border border-rp-primary bg-rp-primary-soft/45 p-8 shadow-rp-glow md:py-12"
                  : "rounded-rp-lg border border-white/10 bg-rp-surface p-8"
              }
              key={pack.name}
            >
              <h3 className={pack.isRecommended ? "font-semibold text-rp-text" : "font-semibold"}>
                {pack.name}
              </h3>
              <p className="mt-5 text-5xl font-semibold tracking-[-0.05em]">
                {formatPrice(pack.priceCents)}
              </p>
              <p className="mt-5 border-t border-white/10 pt-5 text-rp-text-muted">
                {pack.credits} credits
              </p>
            </article>
          ))}
        </div>
        <div className="mt-10 text-center">
          <p className="text-sm text-rp-text-muted">
            One credit equals one video minute. Partial minutes round up.
          </p>
          <Link
            className="mt-6 inline-flex min-h-12 items-center gap-2 rounded-rp-md bg-rp-primary px-5 font-semibold text-rp-primary-foreground hover:bg-rp-primary-hover"
            href={isAuthenticated ? "/dashboard" : "/signup"}
          >
            {isAuthenticated ? "Open dashboard" : "Create workspace"}
            <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}

export function FinalCta({ isAuthenticated }: SessionAwareProps) {
  return (
    <section className="relative isolate overflow-hidden border-t border-white/8 bg-rp-surface/45">
      <div className="mx-auto max-w-7xl px-5 pb-20 pt-24 sm:px-8 sm:pt-32 lg:px-10">
        <div className="max-w-4xl">
          <h2 className="text-4xl font-semibold leading-tight tracking-[-0.055em] sm:text-6xl">
            Your long-form story already has more to give.
          </h2>
          <p className="mt-6 max-w-xl text-lg leading-7 text-rp-text-muted">
            Create your workspace and start shaping the moments worth sharing.
          </p>
          <Link
            className="mt-8 inline-flex min-h-12 items-center gap-2 rounded-rp-md bg-rp-primary px-5 font-semibold text-rp-primary-foreground hover:bg-rp-primary-hover"
            href={isAuthenticated ? "/dashboard" : "/signup"}
          >
            {isAuthenticated ? "Open dashboard" : "Create workspace"}
            <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
        </div>
      </div>
      <footer className="border-t border-white/8 bg-rp-bg">
        <div className="mx-auto flex max-w-7xl flex-col gap-8 px-5 py-8 sm:px-8 md:flex-row md:items-center md:justify-between lg:px-10">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-8">
            <BrandMark href="/" />
            <p className="text-sm text-rp-text-muted">Metadata first. Render later.</p>
          </div>
          <nav
            aria-label="Footer"
            className="flex flex-wrap gap-x-6 gap-y-3 text-sm text-rp-text-muted"
          >
            <a className="hover:text-rp-text" href="#workflow">
              Workflow
            </a>
            <a className="hover:text-rp-text" href="#outputs">
              Outputs
            </a>
            <a className="hover:text-rp-text" href="#pricing">
              Pricing
            </a>
            {!isAuthenticated ? (
              <Link className="hover:text-rp-text" href="/login">
                Sign in
              </Link>
            ) : null}
          </nav>
        </div>
      </footer>
    </section>
  );
}
