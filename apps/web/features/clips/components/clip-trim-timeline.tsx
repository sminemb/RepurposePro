"use client";

import { Slider } from "@base-ui/react/slider";
import { useId } from "react";
import { formatClipTime } from "../client/clip-time";

const thumbClass =
  "flex size-11 cursor-ew-resize items-center justify-center rounded-rp-sm text-rp-text focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-rp-primary";

export function ClipTrimTimeline({
  startTime,
  endTime,
  duration,
  currentTime,
  disabled = false,
  onChange,
}: {
  startTime: number;
  endTime: number;
  duration: number;
  currentTime: number;
  disabled?: boolean;
  onChange: (startTime: number, endTime: number) => void;
}) {
  const hintId = useId();
  const maximum = Math.max(1, Math.floor(duration * 1000));
  return (
    <div className="mx-auto mt-4 max-w-sm rounded-rp-md border border-rp-border bg-rp-surface p-3">
      <div className="flex justify-between gap-3 text-xs text-rp-text-muted">
        <p>
          Start{" "}
          <span className="mt-1 block tabular-nums text-rp-text">{formatClipTime(startTime)}</span>
        </p>
        <p className="text-right">
          End{" "}
          <span className="mt-1 block tabular-nums text-rp-text">{formatClipTime(endTime)}</span>
        </p>
      </div>
      <Slider.Root
        aria-label="Clip trim timeline"
        className="px-3"
        min={0}
        max={maximum}
        step={1}
        largeStep={1000}
        minStepsBetweenValues={1}
        thumbCollisionBehavior="none"
        disabled={disabled || duration < 0.001}
        value={[Math.round(startTime * 1000), Math.round(endTime * 1000)]}
        onValueChange={([start, end]) => {
          if (start !== undefined && end !== undefined) onChange(start / 1000, end / 1000);
        }}
      >
        <Slider.Control className="relative flex h-24 w-full touch-none items-center select-none">
          <Slider.Track className="relative h-2 w-full rounded-full bg-rp-border-strong">
            <Slider.Indicator className="absolute h-full rounded-full bg-rp-primary" />
            <span
              aria-hidden="true"
              data-testid="clip-playhead"
              className="pointer-events-none absolute top-1/2 z-10 h-5 w-0.5 -translate-x-1/2 -translate-y-1/2 bg-rp-text"
              style={{
                left: `${Math.max(0, Math.min(100, ((currentTime * 1000) / maximum) * 100))}%`,
              }}
            />
            {["Start", "End"].map((label, index) => (
              <Slider.Thumb
                key={label}
                index={index}
                aria-label={`${label} time`}
                aria-describedby={hintId}
                getAriaValueText={(_, value) => `${label} ${formatClipTime(value / 1000)}`}
                className={`${thumbClass} ${index === 0 ? "-mt-6" : "mt-6"}`}
              >
                <span
                  aria-hidden="true"
                  className="flex h-8 w-6 items-center justify-center rounded-rp-sm border border-rp-primary bg-rp-surface-elevated text-xs font-semibold shadow-sm"
                >
                  {index === 0 ? "[" : "]"}
                </span>
              </Slider.Thumb>
            ))}
          </Slider.Track>
        </Slider.Control>
      </Slider.Root>
      <div className="flex justify-between gap-2 text-xs tabular-nums text-rp-text-muted">
        <span>{formatClipTime(0)}</span>
        <span>{formatClipTime(duration)}</span>
      </div>
      <p id={hintId} className="mt-3 text-xs leading-5 text-rp-text-muted">
        Drag the handles to trim. Arrow keys adjust milliseconds; Page Up/Down adjusts seconds.
      </p>
    </div>
  );
}
