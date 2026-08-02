import { describe, expect, it } from "vitest";

import {
  CLIP_END_TOLERANCE_SECONDS,
  CLIP_SEEK_TOLERANCE_SECONDS,
  captionAtTime,
  clipPlaybackBoundaryAction,
  createSourceVideoContentUrl,
} from "./clip-preview-playback";

describe("clip preview playback", () => {
  it("seeks, stops, or loops only at clip boundaries", () => {
    const clip = { endTime: 20, startTime: 5 };
    expect(clipPlaybackBoundaryAction(4, clip, true)).toBe("seek_start");
    expect(clipPlaybackBoundaryAction(12, clip, true)).toBe("continue");
    expect(clipPlaybackBoundaryAction(20, clip, true)).toBe("loop");
    expect(clipPlaybackBoundaryAction(20, clip, true, "seeking")).toBe("stop");
    expect(clipPlaybackBoundaryAction(20, clip, false)).toBe("stop");
    expect(clipPlaybackBoundaryAction(5 - CLIP_SEEK_TOLERANCE_SECONDS, clip, true)).toBe(
      "continue",
    );
    expect(clipPlaybackBoundaryAction(20 - CLIP_END_TOLERANCE_SECONDS, clip, true)).toBe("loop");
  });

  it("returns caption text as data for the active timestamp", () => {
    const lines = [
      { endTime: 10, startTime: 5, text: "<script>plain text</script>" },
      { endTime: 15, startTime: 10, text: "Second caption" },
    ];
    expect(captionAtTime(lines, 7)?.text).toBe("<script>plain text</script>");
    expect(captionAtTime(lines, 15)).toBeNull();
  });

  it("builds the authenticated media URL with an encoded project ID", () => {
    expect(createSourceVideoContentUrl("http://localhost:3001/api/v1/", "project / one")).toBe(
      "http://localhost:3001/api/v1/projects/project%20%2F%20one/source-video/content",
    );
  });
});
