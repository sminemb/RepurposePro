"use client";

import {
  cropAtTime,
  cropObjectPosition,
  defaultFraming,
  selectPrimaryTrack,
  type Framing,
  type FramingTracks,
  type ClipPreviewCandidate,
} from "@repurposepro/shared";
import { useEffect, useMemo, useRef, useState } from "react";

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
  tracks = null,
  onFramingChange,
}: {
  clip: ClipPreviewCandidate;
  apiUrl: string;
  projectId: string;
  onTimeChange: (time: number) => void;
  tracks?: FramingTracks | null;
  onFramingChange?: (framing: Framing) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [time, setTime] = useState(clip.startTime);
  const [loop, setLoop] = useState(true);
  const [failed, setFailed] = useState(false);
  const [dimensions, setDimensions] = useState({ width: 1920, height: 1080 });
  const primary = useMemo(
    () =>
      tracks
        ? selectPrimaryTrack(tracks, { startTime: clip.startTime, endTime: clip.endTime })
        : null,
    [tracks, clip.startTime, clip.endTime],
  );
  const framing = clip.framing
    ? { ...clip.framing, trackId: clip.framing.trackId ?? primary }
    : undefined;
  const crop = framing
    ? cropAtTime(framing, tracks, time, dimensions, clip)
    : (clip.crop ?? cropAtTime(defaultFraming, null, time, dimensions, clip));
  const position = cropObjectPosition(crop);
  const drag = useRef<{ x: number; y: number; center: { x: number; y: number } } | null>(null);
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let frame = 0;
    const tick = () => {
      setTime(video.currentTime);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [clip.id]);
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
            objectPosition: `${position.x}% ${position.y}%`,
          }}
          onLoadedMetadata={(event) => {
            setDimensions({
              width: event.currentTarget.videoWidth,
              height: event.currentTarget.videoHeight,
            });
            setFailed(false);
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
        {framing?.mode === "manual" && onFramingChange && (
          <div
            role="group"
            aria-label="Drag picture to adjust framing"
            className="absolute inset-x-0 top-0 bottom-16 cursor-move touch-none"
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              drag.current = { x: event.clientX, y: event.clientY, center: framing.manualCenter };
            }}
            onPointerUp={() => {
              drag.current = null;
            }}
            onPointerCancel={() => {
              drag.current = null;
            }}
            onPointerMove={(event) => {
              if (!drag.current) return;
              const rect = event.currentTarget.parentElement!.getBoundingClientRect();
              onFramingChange({
                ...framing,
                manualCenter: {
                  x: Math.max(
                    0,
                    Math.min(
                      1,
                      drag.current.center.x -
                        ((event.clientX - drag.current.x) / rect.width) * crop.width,
                    ),
                  ),
                  y: Math.max(
                    0,
                    Math.min(
                      1,
                      drag.current.center.y -
                        ((event.clientY - drag.current.y) / rect.height) * crop.height,
                    ),
                  ),
                },
              });
            }}
          />
        )}
        {clip.captionsEnabled && line ? (
          <CaptionOverlay
            line={line}
            position={clip.captionPosition}
            fontSize={clip.previewFontSize}
            textColor={clip.captionTextColor}
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
