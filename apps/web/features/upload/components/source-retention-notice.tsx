"use client";
import { ExpirationBadge } from "@/components/app/expiration-badge";
import type { SourceVideoMetadata } from "@repurposepro/shared";
export function SourceRetentionNotice({
  metadata,
  available,
  error = "",
}: {
  metadata: SourceVideoMetadata | null;
  available: boolean;
  error?: string;
}) {
  return (
    <aside
      className="my-4 rounded-rp-md border border-rp-border bg-rp-surface p-4 text-sm leading-6 text-rp-text-muted"
      aria-label="Source video retention"
    >
      {metadata ? (
        <ExpirationBadge expiresAt={metadata.expiresAt} label="Source video" />
      ) : (
        <p>{error || "Checking source video availability…"}</p>
      )}
      <p className="mt-2">
        {metadata && !available
          ? "The source video is no longer available. Your saved edits remain, and existing exports keep their own expiration dates. Create a new project to upload again."
          : "Source playback and new processing end at this deadline. Each saved export has its own deadline."}
      </p>
    </aside>
  );
}
