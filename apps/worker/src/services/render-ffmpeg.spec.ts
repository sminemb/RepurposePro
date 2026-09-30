import { describe, it, expect } from "vitest";
import { cropCommands, parseProgress, displayDimensions } from "./render-ffmpeg";
import { cropAtTime, type ClipPreviewCandidate } from "@repurposepro/shared";
const clip: ClipPreviewCandidate = {
  id: "00000000-0000-4000-8000-000000000001",
  title: "Fixture",
  startTime: 1,
  endTime: 2,
  rank: 0,
  score: 1,
  crop: null,
  captionStyle: "hormozi",
  captionsEnabled: false,
  captionLines: [],
  captionPosition: { x: 0.5, y: 0.72 },
  previewFontSize: 64,
  framing: {
    mode: "manual",
    trackId: null,
    offset: { x: 0, y: 0 },
    manualCenter: { x: 0.9, y: 0.5 },
  },
};
describe("render geometry and progress", () => {
  it("normalizes rotation and pixel aspect ratio before crop", () => {
    expect(
      displayDimensions({
        width: 720,
        height: 576,
        sample_aspect_ratio: "16:15",
        side_data_list: [],
      }),
    ).toEqual({ width: 768, height: 576 });
    expect(
      displayDimensions({
        width: 720,
        height: 576,
        sample_aspect_ratio: "16:15",
        side_data_list: [{ rotation: 90 }],
      }),
    ).toEqual({ width: 540, height: 720 });
  });
  it("uses the shared crop at every output frame", () => {
    const dims = { width: 1920, height: 1080 };
    const crop = cropAtTime(clip.framing!, null, 1, dims, clip);
    expect(cropCommands(clip, null, dims)).toContain(
      `crop@frame x ${(crop.x * dims.width).toFixed(6)}`,
    );
    expect(cropCommands(clip, null, dims).split("\n")).toHaveLength(31);
  });
  it("does not report completion before output is persisted", () => {
    expect(parseProgress("out_time_us=1000000", 1)).toBe(95);
    expect(parseProgress("out_time_us=-200", 2)).toBe(5);
    expect(parseProgress("progress=end", 2)).toBeNull();
  });
});
