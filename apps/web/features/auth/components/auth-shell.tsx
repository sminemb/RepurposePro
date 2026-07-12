import { ArrowLeft, Scissors } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

import { BrandMark } from "@/components/app/brand-mark";

interface AuthShellProps {
  readonly children: ReactNode;
  readonly description: string;
  readonly title: string;
}

export function AuthShell({ children, description, title }: AuthShellProps) {
  return (
    <main className="grid min-h-dvh bg-rp-bg lg:grid-cols-[1.08fr_0.92fr]">
      <section className="relative hidden min-h-dvh overflow-hidden border-r border-white/8 lg:block">
        <Image
          fill
          priority
          alt="Two creators recording a podcast"
          className="object-cover"
          sizes="55vw"
          src="/images/podcast-studio.png"
        />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgb(5_6_8_/_0.15),rgb(5_6_8_/_0.6)),linear-gradient(0deg,rgb(5_6_8_/_0.94),transparent_55%)]" />
        <BrandMark className="absolute left-10 top-8 z-10" href="/" />
        <div className="absolute bottom-10 left-10 right-10 z-10">
          <div className="flex items-end gap-3">
            <div className="max-w-lg">
              <p className="text-sm font-medium text-rp-primary">
                One recording, more useful content
              </p>
              <p className="mt-3 text-3xl font-semibold leading-tight tracking-[-0.045em]">
                Keep the story. Focus the moments.
              </p>
            </div>
            <div aria-hidden="true" className="ml-auto flex items-end gap-2">
              {["18%", "52%", "77%"].map((position, index) => (
                <div
                  className="relative h-28 w-17 overflow-hidden rounded-rp-sm border border-rp-primary/35"
                  key={position}
                >
                  <Image
                    fill
                    alt=""
                    className="object-cover"
                    sizes="68px"
                    src="/images/podcast-studio.png"
                    style={{ objectPosition: position }}
                  />
                  {index === 1 ? (
                    <span className="absolute inset-0 grid place-items-center bg-rp-primary/18">
                      <Scissors className="size-4 text-white" />
                    </span>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="flex min-h-dvh flex-col px-5 py-6 sm:px-10 lg:px-14">
        <div className="flex items-center justify-between">
          <BrandMark className="lg:hidden" href="/" />
          <Link
            className="ml-auto inline-flex min-h-11 items-center gap-2 text-sm text-rp-text-muted hover:text-rp-text"
            href="/"
          >
            <ArrowLeft aria-hidden="true" className="size-4" /> Back to home
          </Link>
        </div>
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-12">
          <div className="mb-9">
            <h1 className="text-4xl font-semibold tracking-[-0.055em] text-rp-text">{title}</h1>
            <p className="mt-3 leading-7 text-rp-text-muted">{description}</p>
          </div>
          {children}
        </div>
      </section>
    </main>
  );
}
