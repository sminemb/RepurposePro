import { BrandMark } from "@/components/app/brand-mark";
import Link from "next/link";

import { LandingHero, WorkflowSection } from "./landing-hero-workflow";
import { OutputsSection, PreviewSection } from "./landing-outputs-preview";
import { FinalCta, PricingSection } from "./landing-pricing-cta";

interface LandingPageProps {
  readonly isAuthenticated: boolean;
}

export function LandingPage({ isAuthenticated }: LandingPageProps) {
  return (
    <main className="overflow-hidden bg-rp-bg text-rp-text">
      <a
        className="sr-only z-50 rounded-rp-sm bg-rp-primary px-4 py-2 text-rp-bg-deep focus:fixed focus:left-4 focus:top-4 focus:not-sr-only"
        href="#main-content"
      >
        Skip to content
      </a>
      <header className="absolute inset-x-0 top-0 z-40 border-b border-white/8 bg-rp-bg/80 backdrop-blur-xl">
        <div className="mx-auto flex h-18 max-w-7xl items-center justify-between px-5 sm:px-8 lg:px-10">
          <BrandMark href="/" />
          <nav
            aria-label="Landing page"
            className="hidden items-center gap-8 text-sm text-rp-text-muted md:flex"
          >
            <a className="transition-colors hover:text-rp-text" href="#workflow">
              Workflow
            </a>
            <a className="transition-colors hover:text-rp-text" href="#outputs">
              Outputs
            </a>
            <a className="transition-colors hover:text-rp-text" href="#pricing">
              Pricing
            </a>
          </nav>
          <div className="flex items-center gap-2 sm:gap-3">
            {!isAuthenticated ? (
              <Link
                className="hidden min-h-11 items-center px-3 text-sm text-rp-text-muted hover:text-rp-text sm:inline-flex"
                href="/login"
              >
                Sign in
              </Link>
            ) : null}
            <Link
              className="inline-flex min-h-11 items-center rounded-rp-md bg-rp-primary px-4 text-sm font-semibold text-rp-bg-deep transition-colors hover:bg-rp-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rp-primary"
              href={isAuthenticated ? "/dashboard" : "/signup"}
            >
              {isAuthenticated ? "Open dashboard" : "Create workspace"}
            </Link>
          </div>
        </div>
      </header>
      <div id="main-content">
        <LandingHero isAuthenticated={isAuthenticated} />
        <WorkflowSection />
        <OutputsSection />
        <PreviewSection />
        <PricingSection isAuthenticated={isAuthenticated} />
        <FinalCta isAuthenticated={isAuthenticated} />
      </div>
    </main>
  );
}
