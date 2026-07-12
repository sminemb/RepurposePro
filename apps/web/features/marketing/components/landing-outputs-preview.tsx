import { Captions, Crop, Scissors } from "lucide-react";
import Image from "next/image";

export function OutputsSection() {
  return (
    <section className="py-24 sm:py-32" id="outputs">
      <div className="mx-auto grid max-w-7xl gap-14 px-5 sm:px-8 lg:grid-cols-[0.72fr_1.28fr] lg:px-10">
        <div className="max-w-lg lg:pt-16">
          <h2 className="text-4xl font-semibold leading-tight tracking-[-0.055em] sm:text-5xl">
            One source. <span className="text-rp-primary">Two focused outputs.</span>
          </h2>
          <div className="mt-10 space-y-9">
            <div>
              <h3 className="text-xl font-semibold">Short clips</h3>
              <p className="mt-2 text-rp-text-muted">Strong moments, ready for vertical feeds.</p>
            </div>
            <div>
              <h3 className="text-xl font-semibold">Summary video</h3>
              <p className="mt-2 text-rp-text-muted">
                A tighter story that keeps the original order.
              </p>
            </div>
          </div>
        </div>

        <div>
          <div className="grid grid-cols-3 gap-3 sm:gap-5">
            {["18%", "50%", "78%"].map((position, index) => (
              <div
                className="relative aspect-[9/16] overflow-hidden rounded-rp-lg border border-white/12 bg-rp-video-canvas"
                key={position}
              >
                <Image
                  fill
                  alt={`Vertical clip preview ${index + 1}`}
                  className="object-cover"
                  sizes="(max-width: 1024px) 29vw, 17vw"
                  src="/images/podcast-studio.png"
                  style={{ objectPosition: position }}
                />
                <div className="absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-black/90 to-transparent" />
                <p className="absolute inset-x-3 bottom-5 text-center text-[10px] font-extrabold uppercase leading-tight text-white sm:text-sm">
                  The idea that <span className="text-rp-primary">changes the cut.</span>
                </p>
              </div>
            ))}
          </div>
          <div className="mt-5 flex items-center gap-2 overflow-hidden rounded-rp-md border border-white/10 bg-rp-surface p-2">
            {["20%", "50%", "78%", "38%"].map((position, index) => (
              <div
                className="relative aspect-video min-w-32 flex-1 overflow-hidden"
                key={`${position}-${index}`}
              >
                <Image
                  fill
                  alt=""
                  className="object-cover"
                  sizes="200px"
                  src="/images/podcast-studio.png"
                  style={{ objectPosition: position }}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

const previewTools = [
  { icon: Scissors, title: "Trim", body: "Start at the right moment and cut the rest." },
  { icon: Crop, title: "Crop", body: "Keep the speaker framed for vertical viewing." },
  { icon: Captions, title: "Captions", body: "Adjust wording, position, and emphasis." },
] as const;

export function PreviewSection() {
  return (
    <section className="border-y border-white/8 bg-rp-surface/55 py-24 sm:py-32">
      <div className="mx-auto grid max-w-7xl items-center gap-14 px-5 sm:px-8 lg:grid-cols-[0.72fr_0.85fr_0.72fr] lg:px-10">
        <div>
          <h2 className="text-4xl font-semibold leading-tight tracking-[-0.055em] sm:text-5xl">
            Preview first. <span className="text-rp-primary">Render when it is right.</span>
          </h2>
          <p className="mt-6 text-base leading-7 text-rp-text-muted">
            Trim the moment, frame the speaker, and shape readable captions without generating a new
            video after every edit.
          </p>
        </div>

        <div className="relative mx-auto aspect-[9/16] w-full max-w-80 overflow-hidden rounded-rp-lg border border-white/15 bg-rp-video-canvas shadow-rp-panel">
          <Image
            fill
            alt="Vertical crop preview of a podcast speaker"
            className="object-cover"
            sizes="320px"
            src="/images/podcast-studio.png"
            style={{ objectPosition: "22%" }}
          />
          <div className="absolute inset-4 border border-dashed border-white/65" />
          <div className="absolute inset-y-4 left-1/4 border-l border-dashed border-rp-primary/80" />
          <div className="absolute inset-y-4 right-1/4 border-r border-dashed border-rp-primary/80" />
          <p className="absolute inset-x-5 bottom-14 text-center text-2xl font-extrabold uppercase leading-none text-white [text-shadow:0_3px_14px_rgb(0_0_0_/_0.9)]">
            Keep the <span className="text-rp-primary">strongest idea</span> in frame.
          </p>
        </div>

        <div className="space-y-8">
          {previewTools.map(({ body, icon: Icon, title }) => (
            <div className="flex gap-4" key={title}>
              <div className="grid size-11 shrink-0 place-items-center rounded-rp-md bg-rp-primary-soft text-rp-primary">
                <Icon aria-hidden="true" className="size-5" />
              </div>
              <div>
                <h3 className="font-semibold text-rp-text">{title}</h3>
                <p className="mt-1 text-sm leading-6 text-rp-text-muted">{body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
