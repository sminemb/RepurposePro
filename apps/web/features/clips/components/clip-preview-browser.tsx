"use client";

import type { ClipPreviewCandidate } from "@repurposepro/shared";
import { Check, Play, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  CLIP_END_TOLERANCE_SECONDS,
  captionAtTime,
  clipPlaybackBoundaryAction,
  type ClipPlaybackBoundaryEvent,
  createSourceVideoContentUrl,
} from "../client/clip-preview-playback";

interface ClipPreviewBrowserProps {
  readonly apiUrl: string;
  readonly clips: readonly ClipPreviewCandidate[];
  readonly projectId: string;
}

export function ClipPreviewBrowser({ apiUrl, clips, projectId }: ClipPreviewBrowserProps) {
  const [activeId, setActiveId] = useState(clips[0]?.id ?? "");
  const [currentTime, setCurrentTime] = useState(clips[0]?.startTime ?? 0);
  const [loopClip, setLoopClip] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  const activeClip = useMemo(
    () => clips.find((clip) => clip.id === activeId) ?? clips[0],
    [activeId, clips],
  );
  const sourceUrl = createSourceVideoContentUrl(apiUrl, projectId);

  useEffect(() => {
    if (!activeClip || !videoRef.current) return;
    videoRef.current.currentTime = activeClip.startTime;
    setCurrentTime(activeClip.startTime);
  }, [activeClip]);

  if (!activeClip) {
    return (
      <section className="rounded-rp-lg border border-rp-border bg-rp-surface/70 p-6">
        <h2 className="text-lg font-semibold text-rp-text">No preview candidates yet</h2>
        <p className="mt-2 text-sm leading-6 text-rp-text-muted">
          The analysis completed without a visible primary candidate. Return to your dashboard and
          try again.
        </p>
      </section>
    );
  }

  const caption = captionAtTime(activeClip.captionLines, currentTime);
  const cropCenter = activeClip.crop
    ? {
        x: (activeClip.crop.x + activeClip.crop.width / 2) * 100,
        y: (activeClip.crop.y + activeClip.crop.height / 2) * 100,
      }
    : { x: 50, y: 50 };

  const enforceBoundary = (video: HTMLVideoElement, event: ClipPlaybackBoundaryEvent): void => {
    const action = clipPlaybackBoundaryAction(video.currentTime, activeClip, loopClip, event);
    if (action === "seek_start" || action === "loop") {
      video.currentTime = activeClip.startTime;
      setCurrentTime(activeClip.startTime);
      if (action === "loop") void video.play().catch(() => undefined);
    } else if (action === "stop") {
      video.pause();
      if (Math.abs(video.currentTime - activeClip.endTime) > CLIP_END_TOLERANCE_SECONDS) {
        video.currentTime = activeClip.endTime;
      }
      setCurrentTime(activeClip.endTime);
    } else {
      setCurrentTime(video.currentTime);
    }
  };

  return (
    <div className="grid gap-7 lg:grid-cols-[minmax(0,22rem)_minmax(19rem,1fr)] lg:items-start">
      <section aria-labelledby="candidate-list-title" className="min-w-0">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-rp-primary">
              AI selections
            </p>
            <h2 id="candidate-list-title" className="mt-2 text-xl font-semibold text-rp-text">
              Choose a clip
            </h2>
          </div>
          <span className="text-sm text-rp-text-muted">{clips.length} available</span>
        </div>
        <div className="mt-5 grid gap-3">
          {clips.map((clip) => {
            const active = clip.id === activeClip.id;
            return (
              <button
                aria-pressed={active}
                className={`min-h-20 rounded-rp-md border p-4 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rp-primary ${
                  active
                    ? "border-rp-primary/60 bg-rp-primary-soft/45 shadow-rp-glow"
                    : "border-rp-border bg-rp-card/65 hover:border-rp-primary/35"
                }`}
                key={clip.id}
                onClick={() => setActiveId(clip.id)}
                type="button"
              >
                <span className="flex items-start justify-between gap-3">
                  <span>
                    <span className="block text-sm font-semibold text-rp-text">{clip.title}</span>
                    <span className="mt-1 block text-xs text-rp-text-muted">
                      {formatTimestamp(clip.startTime)}–{formatTimestamp(clip.endTime)} ·{" "}
                      {Math.round(clip.endTime - clip.startTime)}s
                    </span>
                  </span>
                  <span
                    aria-hidden="true"
                    className={`grid size-7 shrink-0 place-items-center rounded-full border ${
                      active
                        ? "border-rp-primary bg-rp-primary text-rp-bg"
                        : "border-rp-border text-rp-text-muted"
                    }`}
                  >
                    {active ? <Check className="size-4" /> : <Play className="ml-0.5 size-3.5" />}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="active-preview-title" className="min-w-0 lg:sticky lg:top-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-rp-primary">
              Browser preview
            </p>
            <h2 id="active-preview-title" className="mt-2 text-xl font-semibold text-rp-text">
              {activeClip.title}
            </h2>
          </div>
          <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-rp-md border border-rp-border bg-rp-card/65 px-3 text-sm text-rp-text">
            <input
              checked={loopClip}
              className="size-4 accent-rp-primary"
              onChange={(event) => setLoopClip(event.target.checked)}
              type="checkbox"
            />
            <RotateCcw aria-hidden="true" className="size-4" /> Loop clip
          </label>
        </div>

        <div className="mx-auto mt-5 w-full max-w-sm overflow-hidden rounded-[1.5rem] border border-rp-border bg-black shadow-rp-card">
          <div className="@container relative aspect-[9/16] overflow-hidden bg-black">
            <video
              className="h-full w-full object-cover"
              controls
              crossOrigin="use-credentials"
              onLoadedMetadata={(event) => {
                event.currentTarget.currentTime = activeClip.startTime;
                setCurrentTime(activeClip.startTime);
              }}
              onPlay={(event) => enforceBoundary(event.currentTarget, "play")}
              onSeeking={(event) => enforceBoundary(event.currentTarget, "seeking")}
              onTimeUpdate={(event) => enforceBoundary(event.currentTarget, "timeupdate")}
              playsInline
              preload="metadata"
              ref={videoRef}
              src={sourceUrl}
              style={{ objectPosition: `${cropCenter.x}% ${cropCenter.y}%` }}
            >
              Your browser does not support HTML video previews.
            </video>
            {activeClip.captionsEnabled && caption ? (
              <p
                className="pointer-events-none absolute z-10 max-w-[88%] rounded-md bg-black/80 px-3 py-2 text-center font-black uppercase leading-tight text-white shadow-lg"
                style={{
                  fontSize: `clamp(1rem, ${activeClip.previewFontSize / 16}cqw, ${activeClip.previewFontSize}px)`,
                  left: `${activeClip.captionPosition.x * 100}%`,
                  top: `${activeClip.captionPosition.y * 100}%`,
                  transform: "translate(-50%, -50%)",
                }}
              >
                {caption.text}
              </p>
            ) : null}
          </div>
        </div>
        <p className="mx-auto mt-4 max-w-sm text-center text-xs leading-5 text-rp-text-muted">
          This is a live browser crop of your source video. No final MP4 has been rendered.
        </p>
      </section>
    </div>
  );
}

function formatTimestamp(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remaining = Math.floor(seconds % 60);
  return `${minutes}:${remaining.toString().padStart(2, "0")}`;
}
