"use client";
import {
  defaultFraming,
  selectPrimaryTrack,
  type Framing,
  type FramingStatus,
} from "@repurposepro/shared";
import { editorFieldClass } from "./trim-controls";

export function FramingControls({
  value,
  status,
  busy,
  error,
  onAnalyze,
  onChange,
  range,
}: {
  value: Framing | undefined;
  status: FramingStatus;
  busy: boolean;
  error: string;
  onAnalyze: () => void;
  onChange: (framing: Framing) => void;
  range: { startTime: number; endTime: number };
}) {
  const framing = value ?? defaultFraming;
  const tracks =
    status.data?.tracks.filter((track) =>
      track.samples.some((s) => s.time >= range.startTime && s.time <= range.endTime),
    ) ?? [];
  const useTracking = () =>
    onChange({
      ...defaultFraming,
      trackId: status.data ? selectPrimaryTrack(status.data, range) : null,
    });
  return (
    <fieldset className="mt-5 space-y-3 border-t border-rp-border pt-4">
      <legend className="font-semibold text-rp-text">Framing</legend>
      <label className="block space-y-2 text-xs text-rp-text-muted">
        <span>Framing mode</span>
        <select
          className={editorFieldClass}
          value={framing.mode}
          onChange={(event) =>
            onChange({ ...framing, mode: event.target.value as Framing["mode"] })
          }
        >
          <option value="follow">Follow person</option>
          <option value="manual">Manual framing</option>
        </select>
      </label>
      {framing.mode === "follow" && (
        <>
          <p role="status" className="text-xs leading-5 text-rp-text-muted">
            {busy
              ? "Finding people in your video…"
              : status.status === "failed"
                ? "Person tracking failed. You can retry or position the frame manually."
                : tracks.length
                  ? `${tracks.length} ${tracks.length === 1 ? "person" : "people"} found in this clip.`
                  : "No person tracking available. Center framing is used until you apply tracking or adjust manually."}
          </p>
          {tracks.length > 0 && (
            <label className="block space-y-2 text-xs text-rp-text-muted">
              <span>Person to follow</span>
              <select
                className={editorFieldClass}
                value={framing.trackId ?? ""}
                onChange={(event) => onChange({ ...framing, trackId: event.target.value || null })}
              >
                <option value="">Main person (automatic)</option>
                {tracks.map((track) => (
                  <option key={track.id} value={track.id}>
                    {track.id.replace("person-", "Person ")}
                  </option>
                ))}
              </select>
            </label>
          )}
          {!value && tracks.length > 0 && (
            <button
              type="button"
              onClick={useTracking}
              className="min-h-11 text-sm font-semibold text-rp-primary"
            >
              Apply person tracking
            </button>
          )}
          {(!tracks.length || error) && (
            <button
              type="button"
              disabled={busy}
              onClick={onAnalyze}
              className="min-h-11 text-sm font-semibold text-rp-primary disabled:opacity-50"
            >
              {status.status === "missing" ? "Find person" : "Retry person tracking"}
            </button>
          )}
        </>
      )}
      {error && (
        <p role="alert" className="text-xs text-rp-danger">
          {error}
        </p>
      )}
      {(["x", "y"] as const).map((axis) => (
        <label key={axis} className="block space-y-2 text-xs text-rp-text-muted">
          <span>
            {axis === "x" ? "Horizontal" : "Vertical"}{" "}
            {framing.mode === "follow" ? "adjustment" : "position"}
          </span>
          <input
            aria-label={`${axis === "x" ? "Horizontal" : "Vertical"} framing`}
            className="h-8 w-full accent-rp-primary"
            type="range"
            min={framing.mode === "follow" ? -1 : 0}
            max={1}
            step={0.005}
            value={framing.mode === "follow" ? framing.offset[axis] : framing.manualCenter[axis]}
            onChange={(event) =>
              onChange(
                framing.mode === "follow"
                  ? {
                      ...framing,
                      offset: { ...framing.offset, [axis]: Number(event.target.value) },
                    }
                  : {
                      ...framing,
                      manualCenter: { ...framing.manualCenter, [axis]: Number(event.target.value) },
                    },
              )
            }
          />
        </label>
      ))}
      <button
        type="button"
        className="min-h-11 text-sm text-rp-text underline"
        onClick={() =>
          onChange({ ...framing, offset: { x: 0, y: 0 }, manualCenter: { x: 0.5, y: 0.5 } })
        }
      >
        Reset framing
      </button>
      {framing.mode === "manual" && (
        <p className="text-xs text-rp-text-muted">
          Drag the picture in the preview, or use the position sliders.
        </p>
      )}
    </fieldset>
  );
}
