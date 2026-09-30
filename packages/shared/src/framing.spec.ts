import { describe, expect, it } from "vitest";

import {
  cropAtTime,
  cropObjectPosition,
  defaultFraming,
  framingSchema,
  framingTracksSchema,
  selectPrimaryTrack,
} from "./framing";

const landscape = { width: 1920, height: 1080 };
const clipRange = { startTime: 10, endTime: 20 };

function sample(time: number, centerX: number, centerY = 0.5, size = 0.1) {
  return {
    time,
    x: centerX - size / 2,
    y: centerY - size / 2,
    width: size,
    height: size,
    confidence: 0.95,
  };
}

function tracks(samples = [sample(10, 0.7)]) {
  return {
    version: "mediapipe-v1" as const,
    ...landscape,
    tracks: [{ id: "person-1", samples }],
  };
}

describe("cropObjectPosition", () => {
  it("converts crop origin into a percentage of the available overflow", () => {
    // A crop centered at 70% must not become object-position: 70%.
    const crop = { x: 0.55, y: 0, width: 0.3, height: 1 };
    const position = cropObjectPosition(crop);

    expect(position.x).toBeCloseTo((0.55 / 0.7) * 100);
    expect(position.y).toBe(50);
  });

  it("reaches both source edges without placing the image outside its viewport", () => {
    expect(cropObjectPosition({ x: 0, y: 0, width: 0.3, height: 1 }).x).toBe(0);
    expect(cropObjectPosition({ x: 0.7, y: 0, width: 0.3, height: 1 }).x).toBe(100);
  });

  it("uses vertical overflow for a source narrower than 9:16", () => {
    const position = cropObjectPosition({ x: 0, y: 0.15, width: 1, height: 0.8 });
    expect(position.x).toBe(50);
    expect(position.y).toBeCloseTo(75);
  });
});

describe("cropAtTime", () => {
  it("centers an off-center person in a fixed 9:16 landscape crop", () => {
    const crop = cropAtTime(defaultFraming, tracks(), 10, landscape, clipRange);

    expect(crop.x + crop.width / 2).toBeCloseTo(0.7);
    expect(crop.width).toBeCloseTo((1080 * 9) / 16 / 1920);
    expect(crop.height).toBe(1);
    expect(crop.y).toBe(0);
  });

  it("interpolates using absolute source time between adjacent tracking samples", () => {
    const data = tracks([sample(10, 0.4), sample(10.2, 0.6)]);
    const crop = cropAtTime(defaultFraming, data, 10.1, landscape, clipRange);

    expect(crop.x + crop.width / 2).toBeCloseTo(0.5);
  });

  it("holds the last reliable center during a long detection gap", () => {
    const data = tracks([sample(10, 0.35), sample(14, 0.75)]);
    const crop = cropAtTime(defaultFraming, data, 12, landscape, clipRange);

    expect(crop.x + crop.width / 2).toBeCloseTo(0.35);
  });

  it("holds the last reliable position after a person leaves the frame", () => {
    const data = tracks([sample(10, 0.35), sample(10.2, 0.45)]);
    const crop = cropAtTime(defaultFraming, data, 18, landscape, clipRange);

    expect(crop.x + crop.width / 2).toBeCloseTo(0.45);
  });

  it("recomputes position deterministically when seeking backwards or looping", () => {
    const data = tracks([sample(10, 0.35), sample(10.2, 0.65)]);
    const first = cropAtTime(defaultFraming, data, 10, landscape, clipRange);
    cropAtTime(defaultFraming, data, 10.2, landscape, clipRange);

    expect(cropAtTime(defaultFraming, data, 10, landscape, clipRange)).toEqual(first);
  });

  it("clamps edge subjects while retaining the same crop size", () => {
    const left = cropAtTime(defaultFraming, tracks([sample(10, 0.05)]), 10, landscape, clipRange);
    const right = cropAtTime(defaultFraming, tracks([sample(10, 0.95)]), 10, landscape, clipRange);

    expect(left.x).toBe(0);
    expect(right.x + right.width).toBeCloseTo(1);
    expect(left.width).toBe(right.width);
  });

  it("uses centered framing when no faces were detected", () => {
    const crop = cropAtTime(defaultFraming, null, 10, landscape, clipRange);

    expect(crop.x + crop.width / 2).toBeCloseTo(0.5);
    expect(cropObjectPosition(crop)).toEqual({ x: 50, y: 50 });
  });

  it("honors manual centers without following available tracks", () => {
    const framing = {
      ...defaultFraming,
      mode: "manual" as const,
      manualCenter: { x: 0.3, y: 0.5 },
    };
    const crop = cropAtTime(framing, tracks(), 10, landscape, clipRange);

    expect(crop.x + crop.width / 2).toBeCloseTo(0.3);
  });

  it("applies a follow adjustment before clamping to source boundaries", () => {
    const framing = { ...defaultFraming, offset: { x: -0.1, y: 0 } };
    const crop = cropAtTime(framing, tracks(), 10, landscape, clipRange);

    expect(crop.x + crop.width / 2).toBeCloseTo(0.6);
  });

  it("crops vertically in a narrow portrait source", () => {
    const portrait = { width: 1080, height: 2400 };
    const framing = {
      ...defaultFraming,
      mode: "manual" as const,
      manualCenter: { x: 0.5, y: 0.6 },
    };
    const crop = cropAtTime(framing, null, 10, portrait, clipRange);

    expect(crop.width).toBe(1);
    expect(crop.height).toBeCloseTo(0.8);
    expect(crop.y + crop.height / 2).toBeCloseTo(0.6);
  });

  it("follows the explicitly selected person even when another person is larger", () => {
    const data = {
      ...tracks(),
      tracks: [
        { id: "person-1", samples: [sample(10, 0.3, 0.5, 0.3)] },
        { id: "person-2", samples: [sample(10, 0.7)] },
      ],
    };
    const framing = { ...defaultFraming, trackId: "person-2" };
    const crop = cropAtTime(framing, data, 10, landscape, clipRange);

    expect(crop.x + crop.width / 2).toBeCloseTo(0.7);
  });
});

describe("selectPrimaryTrack", () => {
  it("prefers a consistently visible person over a briefly prominent visitor", () => {
    const data = {
      ...tracks(),
      tracks: [
        { id: "visitor", samples: [sample(10, 0.75, 0.5, 0.3)] },
        {
          id: "regular",
          samples: Array.from({ length: 51 }, (_, index) => sample(10 + index / 5, 0.4)),
        },
      ],
    };

    expect(selectPrimaryTrack(data, clipRange)).toBe("regular");
  });

  it("chooses from the clip range instead of unrelated earlier footage", () => {
    const data = {
      ...tracks(),
      tracks: [
        {
          id: "earlier",
          samples: Array.from({ length: 40 }, (_, index) => sample(index / 5, 0.3, 0.5, 0.3)),
        },
        { id: "current", samples: [sample(10, 0.7), sample(10.2, 0.7)] },
      ],
    };

    expect(selectPrimaryTrack(data, clipRange)).toBe("current");
    expect(selectPrimaryTrack({ ...data, tracks: [] }, clipRange)).toBeNull();
  });
});

describe("framing contracts", () => {
  it("accepts the compatible default and rejects out-of-bounds manual input", () => {
    expect(framingSchema.parse(defaultFraming)).toEqual({
      mode: "follow",
      trackId: null,
      offset: { x: 0, y: 0 },
      manualCenter: { x: 0.5, y: 0.5 },
    });
    expect(
      framingSchema.safeParse({ ...defaultFraming, manualCenter: { x: 1.1, y: 0.5 } }).success,
    ).toBe(false);
  });

  it("validates source-space samples and rejects invalid dimensions and timestamps", () => {
    expect(framingTracksSchema.safeParse(tracks()).success).toBe(true);
    expect(framingTracksSchema.safeParse({ ...tracks(), width: 0 }).success).toBe(false);
    expect(framingTracksSchema.safeParse(tracks([sample(-1, 0.5)])).success).toBe(false);
    expect(framingTracksSchema.safeParse(tracks([sample(10, Number.NaN)])).success).toBe(false);
  });
});
