import { describe, expect, it } from "vitest";

import { formatFileSize, formatVideoDuration, formatVideoFps } from "./video-metadata";

describe("video metadata formatting", () => {
  it("formats upload metadata for quick scanning", () => {
    expect(formatVideoDuration(60.001)).toBe("1:00");
    expect(formatFileSize(1_572_864)).toBe("1.5 MB");
    expect(formatVideoFps(29.97)).toBe("29.97 fps");
  });

  it("omits an unavailable frame rate instead of inventing a value", () => {
    expect(formatVideoFps(null)).toBeNull();
  });
});
