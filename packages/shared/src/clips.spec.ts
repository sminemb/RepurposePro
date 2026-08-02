import { describe, expect, it } from "vitest";

import { projectClipListSchema } from "./clips";

const projectId = "00000000-0000-4000-8000-000000004001";
const candidate = {
  captionLines: [{ endTime: 15, startTime: 0, text: "Caption" }],
  captionPosition: { x: 0.5, y: 0.72 },
  captionStyle: "hormozi",
  captionsEnabled: true,
  crop: null,
  endTime: 15,
  id: "00000000-0000-4000-8000-000000004002",
  previewFontSize: 48,
  rank: 0,
  score: 0.9,
  startTime: 0,
  title: "Opening",
} as const;

describe("projectClipListSchema", () => {
  it("coerces database source duration and strips row-level unknown keys", () => {
    expect(
      projectClipListSchema.parse({
        clips: [candidate],
        internal: "not serialized",
        projectId,
        sourceDurationSeconds: "30.000",
      }),
    ).toEqual({ clips: [candidate], projectId, sourceDurationSeconds: 30 });
  });

  it.each([
    ["clip range", { ...candidate, endTime: 31 }],
    ["caption range", { ...candidate, captionLines: [{ endTime: 20, startTime: 0, text: "x" }] }],
    ["crop bounds", { ...candidate, crop: { height: 1, width: 0.3, x: 0.8, y: 0 } }],
    ["candidate unknown key", { ...candidate, internal: true }],
  ])("rejects invalid %s data", (_label, clip) => {
    expect(
      projectClipListSchema.safeParse({ clips: [clip], projectId, sourceDurationSeconds: 30 })
        .success,
    ).toBe(false);
  });
});
