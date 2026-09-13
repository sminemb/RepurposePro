"use client";

import type { ClipPreviewCandidate } from "@repurposepro/shared";
import { useEffect, useRef, useState } from "react";

import {
  captionAtTime,
  clipPlaybackBoundaryAction,
  createSourceVideoContentUrl,
  type ClipPlaybackBoundaryEvent,
} from "../client/clip-preview-playback";
import { CaptionOverlay } from "./caption-overlay";

export function ClipPreviewPlayer({
  clip,
  apiUrl,
  projectId,
  onTimeChange,
}: {
  clip: ClipPreviewCandidate;
  apiUrl: string;
  projectId: string;
  onTimeChange: (time: number) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [time, setTime] = useState(clip.startTime);
  const [loop, setLoop] = useState(true);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const video = videoRef.current;
    if (video && (video.currentTime < clip.startTime || video.currentTime >= clip.endTime)) {
      video.currentTime = clip.startTime;
      setTime(clip.startTime);
    }
  }, [clip.id, clip.startTime, clip.endTime]);
  const boundary = (video: HTMLVideoElement, event: ClipPlaybackBoundaryEvent) => {
    const action = clipPlaybackBoundaryAction(video.currentTime, clip, loop, event);
    if (action === "seek_start" || action === "loop") {
      video.currentTime = clip.startTime;
      if (action === "loop") void video.play().catch(() => undefined);
    } else if (action === "stop") {
      video.pause();
      if (Math.abs(video.currentTime - clip.endTime) > 0.02) video.currentTime = clip.endTime;
    }
    setTime(video.currentTime);
    onTimeChange(video.currentTime);
  };
  const line =
    time >= clip.startTime && time < clip.endTime ? captionAtTime(clip.captionLines, time) : null;
  const crop = clip.crop;
  return (
    <section aria-label="Live clip preview" className="min-w-0">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="font-semibold text-rp-text">Live preview</h2>
        <label className="flex min-h-11 items-center gap-2 text-sm text-rp-text-muted">
          <input
            type="checkbox"
            checked={loop}
            onChange={(event) => setLoop(event.target.checked)}
            className="accent-rp-primary"
          />
          Loop clip
        </label>
      </div>
      <div className="@container relative mx-auto aspect-[9/16] w-full max-w-sm overflow-hidden rounded-rp-lg border border-rp-border bg-black">
        <video
          ref={videoRef}
          className="h-full w-full object-cover"
          controls
          crossOrigin="use-credentials"
          playsInline
          preload="metadata"
          src={createSourceVideoContentUrl(apiUrl, projectId)}
          style={{
            objectPosition: crop
              ? `${(crop.x + crop.width / 2) * 100}% ${(crop.y + crop.height / 2) * 100}%`
              : "50% 50%",
          }}
          onLoadedMetadata={(event) => {
            event.currentTarget.currentTime = clip.startTime;
            setTime(clip.startTime);
          }}
          onPlay={(event) => boundary(event.currentTarget, "play")}
          onSeeking={(event) => boundary(event.currentTarget, "seeking")}
          onTimeUpdate={(event) => boundary(event.currentTarget, "timeupdate")}
          onError={() => setFailed(true)}
        >
          Your browser does not support video previews.
        </video>
        {clip.captionsEnabled && line ? (
          <CaptionOverlay
            line={line}
            position={clip.captionPosition}
            fontSize={clip.previewFontSize}
          />
        ) : null}
      </div>
      {failed ? (
        <p role="alert" className="mt-3 text-sm text-rp-danger">
          The source video could not be played. It may have expired or use an unsupported format.
          Your metadata can still be saved.
        </p>
      ) : null}
      <p className="mt-3 text-center text-xs text-rp-text-muted">
        {time.toFixed(2)}s / {clip.endTime.toFixed(2)}s · Preview updates instantly
      </p>
    </section>
  );
}
