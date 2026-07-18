import { ArrowRight, Captions, Clapperboard, Crop, Sparkles, UploadCloud } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

interface SessionAwareProps {
  readonly isAuthenticated: boolean;
}

export function LandingHero({ isAuthenticated }: SessionAwareProps) {
  return (
    <section className="relative isolate overflow-hidden pt-18">
      <div className="mx-auto grid max-w-7xl items-center gap-8 px-5 pb-14 pt-12 sm:px-8 lg:grid-cols-[1.05fr_0.95fr] lg:gap-12 lg:px-10 lg:pb-20 lg:pt-16">
        <div className="relative z-10 max-w-2xl">
          <p className="mb-5 text-sm font-medium text-rp-primary">AI-assisted video repurposing</p>
          <h1 className="text-5xl font-semibold leading-[0.98] tracking-[-0.065em] text-rp-text sm:text-6xl lg:text-6xl xl:text-7xl">
            Turn long videos into <span className="text-rp-primary">high-performing clips.</span>
          </h1>
          <p className="mt-6 max-w-xl text-base leading-7 text-rp-text-muted sm:text-lg">
            Find the strongest moments, shape the captions, and render only when you are ready.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Link
              className="inline-flex min-h-12 items-center gap-2 rounded-rp-md bg-rp-primary px-5 font-semibold text-rp-primary-foreground shadow-rp-glow transition-colors hover:bg-rp-primary-hover"
              href={isAuthenticated ? "/dashboard" : "/signup"}
            >
              {isAuthenticated ? "Open dashboard" : "Create workspace"}
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
            {!isAuthenticated ? (
              <Link
                className="inline-flex min-h-12 items-center px-3 text-rp-text-muted hover:text-rp-text"
                href="/login"
              >
                Sign in
              </Link>
            ) : null}
          </div>
        </div>

        <div className="relative mx-auto mb-6 w-full max-w-3xl lg:mb-2">
          <div className="relative aspect-video overflow-hidden rounded-rp-lg border border-white/12 bg-rp-surface shadow-rp-panel">
            <Image
              fill
              loading="eager"
              priority
              alt="Two creators recording a long-form podcast"
              className="object-cover"
              sizes="(max-width: 1024px) 92vw, 55vw"
              src="/images/podcast-studio.png"
            />
            <div className="absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-rp-bg-deep to-transparent" />
            <div className="absolute bottom-4 left-4 right-4 flex items-center gap-3 text-xs text-rp-text-muted">
              <span className="font-medium text-rp-text">Full conversation</span>
              <span className="h-px flex-1 bg-white/20">
                <span className="block h-px w-2/3 bg-rp-primary" />
              </span>
              <span>42:18</span>
            </div>
          </div>
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -bottom-7 right-2 flex items-end gap-2 sm:-right-4 sm:gap-3"
          >
            {["20%", "51%", "73%"].map((position) => (
              <div
                className="relative h-44 w-25 overflow-hidden rounded-rp-md border border-rp-primary/45 bg-rp-bg-deep shadow-rp-card sm:h-58 sm:w-34"
                key={position}
              >
                <Image
                  fill
                  alt=""
                  className="object-cover"
                  sizes="136px"
                  src="/images/podcast-studio.png"
                  style={{ objectPosition: position }}
                />
                <div className="absolute inset-x-2 bottom-3 text-center text-[10px] font-bold uppercase leading-tight text-white sm:text-xs">
                  Strong moments <span className="text-rp-primary">stand alone.</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

const workflow = [
  { icon: UploadCloud, title: "Upload", body: "Bring in a local long-form video." },
  {
    icon: Sparkles,
    title: "Find the moments",
    body: "AI scans the transcript for strong hooks and useful ideas.",
  },
  {
    icon: Crop,
    title: "Shape the preview",
    body: "Trim, frame, and review before spending time on a render.",
  },
  {
    icon: Clapperboard,
    title: "Render on command",
    body: "Export only the clips or summary you approve.",
  },
] as const;

export function WorkflowSection() {
  return (
    <section className="border-y border-white/8 bg-rp-surface/45 py-24 sm:py-30" id="workflow">
      <div className="mx-auto max-w-7xl px-5 sm:px-8 lg:px-10">
        <div className="max-w-3xl">
          <h2 className="text-4xl font-semibold tracking-[-0.055em] sm:text-5xl">
            From source video to ready-to-share.
          </h2>
          <p className="mt-5 max-w-2xl text-base leading-7 text-rp-text-muted">
            A clear workflow keeps creative decisions in your hands and heavy rendering out of
            ordinary edits.
          </p>
        </div>
        <div className="relative mt-14 grid gap-10 md:grid-cols-2 lg:grid-cols-4">
          <div className="absolute left-0 right-0 top-6 hidden h-px bg-gradient-to-r from-rp-primary/70 via-rp-primary/20 to-transparent lg:block" />
          {workflow.map(({ body, icon: Icon, title }) => (
            <article className="relative" key={title}>
              <div className="relative z-10 grid size-12 place-items-center rounded-rp-md border border-rp-primary/35 bg-rp-primary-soft text-rp-primary">
                <Icon aria-hidden="true" className="size-5" />
              </div>
              <h3 className="mt-6 text-lg font-semibold">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-rp-text-muted">{body}</p>
            </article>
          ))}
        </div>
        <div className="mt-14 flex items-center gap-3 text-sm text-rp-text-muted">
          <Captions aria-hidden="true" className="size-4 text-rp-primary" /> Browser previews keep
          ordinary edits fast.
        </div>
      </div>
    </section>
  );
}
