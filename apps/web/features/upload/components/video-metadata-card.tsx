import type { SourceVideoMetadata } from "@repurposepro/shared";
import { BadgeCheck, Clock3, FileVideo, Monitor } from "lucide-react";

import { Badge } from "@/components/ui/badge";

import { formatFileSize, formatVideoDuration, formatVideoFps } from "./video-metadata";

interface VideoMetadataCardProps {
  readonly metadata: SourceVideoMetadata;
}

export function VideoMetadataCard({ metadata }: VideoMetadataCardProps) {
  const fps = formatVideoFps(metadata.fps);

  return (
    <section
      aria-labelledby="validated-video-title"
      className="rounded-rp-lg border border-rp-border bg-rp-surface/75 p-5 shadow-rp-card"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-rp-md border border-rp-primary/25 bg-rp-primary-soft text-rp-primary">
            <FileVideo aria-hidden="true" className="size-5" />
          </span>
          <div className="min-w-0">
            <h2 id="validated-video-title" className="text-base font-semibold text-rp-text">
              Video validated
            </h2>
            <p className="mt-1 truncate text-sm text-rp-text-muted">{metadata.fileName}</p>
          </div>
        </div>
        <Badge
          className="border-rp-success/35 bg-rp-success-soft text-rp-success"
          variant="outline"
        >
          <BadgeCheck aria-hidden="true" className="size-3.5" /> Validated
        </Badge>
      </div>

      <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-rp-md border border-rp-border bg-rp-card/65 px-3 py-3">
          <dt className="flex items-center gap-2 text-xs text-rp-text-muted">
            <Clock3 aria-hidden="true" className="size-3.5" /> Duration
          </dt>
          <dd className="mt-1 font-medium text-rp-text">
            {formatVideoDuration(metadata.durationSeconds)}
          </dd>
        </div>
        <div className="rounded-rp-md border border-rp-border bg-rp-card/65 px-3 py-3">
          <dt className="text-xs text-rp-text-muted">File size</dt>
          <dd className="mt-1 font-medium text-rp-text">
            {formatFileSize(metadata.fileSizeBytes)}
          </dd>
        </div>
        <div className="rounded-rp-md border border-rp-border bg-rp-card/65 px-3 py-3">
          <dt className="flex items-center gap-2 text-xs text-rp-text-muted">
            <Monitor aria-hidden="true" className="size-3.5" /> Resolution
          </dt>
          <dd className="mt-1 font-medium text-rp-text">
            {metadata.width} × {metadata.height}
          </dd>
        </div>
        {fps ? (
          <div className="rounded-rp-md border border-rp-border bg-rp-card/65 px-3 py-3">
            <dt className="text-xs text-rp-text-muted">Frame rate</dt>
            <dd className="mt-1 font-medium text-rp-text">{fps}</dd>
          </div>
        ) : null}
      </dl>

      <div className="mt-5 rounded-rp-md border border-rp-primary/35 bg-rp-primary-soft/70 px-4 py-4">
        <p className="text-sm font-semibold text-rp-text">
          {metadata.requiredCredits} {metadata.requiredCredits === 1 ? "credit" : "credits"}{" "}
          required
        </p>
        <p className="mt-1 text-sm leading-6 text-rp-text-muted">
          One credit covers one video minute. Partial minutes round up before processing starts.
        </p>
      </div>
    </section>
  );
}
