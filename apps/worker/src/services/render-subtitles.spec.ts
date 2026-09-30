import { describe, it, expect } from "vitest";
import { generateAss, assColor, escapeAss } from "./render-subtitles";
import type { ClipPreviewCandidate } from "@repurposepro/shared";
const clip: ClipPreviewCandidate = {
  id: "00000000-0000-4000-8000-000000000001",
  title: "Clip",
  startTime: 4.125,
  endTime: 7.5,
  rank: 0,
  score: 0.9,
  crop: null,
  captionStyle: "hormozi",
  captionsEnabled: true,
  captionPosition: { x: 0.5, y: 0.72 },
  previewFontSize: 64,
  captionTextColor: "#ffff00",
  captionLines: [
    {
      startTime: 4.125,
      endTime: 5.625,
      text: "Great {idea}",
      highlights: ["idea"],
      highlightColors: { idea: "#00ff00" },
    },
    { startTime: 6, endTime: 7.5, text: "Later" },
  ],
};
describe("saved ASS captions", () => {
  it("uses output-relative times and inline BGR colors without filling silence", () => {
    const ass = generateAss(clip, (text) => text.length * 30);
    expect(ass).toContain("0:00:00.00,0:00:01.50");
    expect(ass).toContain("0:00:01.88,0:00:03.38");
    expect(ass).toContain("\\1c&H00FF00&");
    expect(ass).toContain("PlayResX: 1080");
    expect(ass).toContain("PlayResY: 1920");
    expect(assColor("#123456")).toBe("&H563412&");
  });
  it("escapes user override syntax and skips disabled captions", () => {
    expect(escapeAss("{\\pos(0,0)}\\N")).not.toContain("{\\pos");
    expect(
      generateAss({ ...clip, captionsEnabled: false }, (text) => text.length * 30),
    ).not.toContain("Dialogue:");
  });
});
