import { z } from "zod";

export const FRAMING_VERSION = "mediapipe-v1";
export const FRAMING_QUEUE = "video-framing-queue";
const unit = z.number().finite().min(0).max(1);
const point = z.object({ x: unit, y: unit }).strict();
export const framingSchema = z
  .object({
    mode: z.enum(["follow", "manual"]),
    trackId: z.string().min(1).max(80).nullable(),
    offset: z
      .object({ x: z.number().finite().min(-1).max(1), y: z.number().finite().min(-1).max(1) })
      .strict(),
    manualCenter: point,
  })
  .strict();
export type Framing = z.infer<typeof framingSchema>;
export const defaultFraming: Framing = {
  mode: "follow",
  trackId: null,
  offset: { x: 0, y: 0 },
  manualCenter: { x: 0.5, y: 0.5 },
};
const sampleSchema = z
  .object({
    time: z.number().finite().nonnegative(),
    x: unit,
    y: unit,
    width: unit.positive(),
    height: unit.positive(),
    confidence: unit,
  })
  .strict()
  .refine((s) => s.x + s.width <= 1.000001 && s.y + s.height <= 1.000001);
export const framingTracksSchema = z
  .object({
    version: z.literal(FRAMING_VERSION),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    tracks: z
      .array(
        z
          .object({
            id: z.string().min(1).max(80),
            samples: z
              .array(sampleSchema)
              .min(1)
              .max(100_000)
              .refine((s) => s.every((v, i) => !i || v.time > s[i - 1]!.time)),
          })
          .strict(),
      )
      .max(200),
  })
  .strict()
  .refine((d) => new Set(d.tracks.map((t) => t.id)).size === d.tracks.length);
export type FramingTracks = z.infer<typeof framingTracksSchema>;
export const framingStatusSchema = z
  .object({
    status: z.enum(["missing", "queued", "active", "completed", "failed"]),
    data: framingTracksSchema.nullable(),
  })
  .strict();
export type FramingStatus = z.infer<typeof framingStatusSchema>;
type Range = { startTime: number; endTime: number };

export function selectPrimaryTrack(data: FramingTracks, range: Range): string | null {
  let best: string | null = null,
    bestScore = 0;
  for (const track of data.tracks) {
    const score = track.samples
      .filter((s) => s.time >= range.startTime && s.time <= range.endTime)
      .reduce((sum, s) => sum + Math.sqrt(s.width * s.height) * s.confidence, 0);
    if (score > bestScore) {
      best = track.id;
      bestScore = score;
    }
  }
  return best;
}

export function cropAtTime(
  framing: Framing,
  data: FramingTracks | null,
  time: number,
  dimensions: { width: number; height: number },
  range: Range,
) {
  const ratio = dimensions.width / dimensions.height;
  const width = Math.min(1, 9 / 16 / ratio),
    height = Math.min(1, ratio / (9 / 16));
  let center = framing.manualCenter;
  if (framing.mode === "follow") {
    center = { x: 0.5, y: 0.5 };
    const id = framing.trackId ?? (data ? selectPrimaryTrack(data, range) : null);
    const samples = data?.tracks.find((t) => t.id === id)?.samples;
    if (samples?.length) {
      // Binary search keeps per-frame playback independent of source length.
      let low = 0,
        high = samples.length;
      while (low < high) {
        const mid = (low + high) >>> 1;
        if (samples[mid]!.time <= time) low = mid + 1;
        else high = mid;
      }
      const before = samples[Math.max(0, low - 1)]!,
        after = samples[low];
      const blend =
        after && after.time - before.time <= 0.6
          ? Math.max(0, Math.min(1, (time - before.time) / (after.time - before.time)))
          : 0;
      center = { x: before.x + before.width / 2, y: before.y + before.height / 2 };
      if (after)
        center = {
          x: center.x + (after.x + after.width / 2 - center.x) * blend,
          y: center.y + (after.y + after.height / 2 - center.y) * blend,
        };
    }
    center = { x: center.x + framing.offset.x, y: center.y + framing.offset.y };
  }
  return {
    x: Math.max(0, Math.min(1 - width, center.x - width / 2)),
    y: Math.max(0, Math.min(1 - height, center.y - height / 2)),
    width,
    height,
  };
}

export function cropObjectPosition(crop: { x: number; y: number; width: number; height: number }) {
  return {
    x: crop.width >= 1 ? 50 : Math.max(0, Math.min(100, (crop.x / (1 - crop.width)) * 100)),
    y: crop.height >= 1 ? 50 : Math.max(0, Math.min(100, (crop.y / (1 - crop.height)) * 100)),
  };
}
