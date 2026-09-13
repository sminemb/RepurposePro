import { describe, expect, it } from "vitest";

import { clipEditInputSchema, projectCaptionLines, validateClipEdit } from "./clip-editor";

const baseline = [
  { id: "a", startTime: 0, endTime: 2, text: "First phrase" },
  { id: "b", startTime: 4, endTime: 6, text: "Second phrase" },
];
const input = {
  expectedRevision: 0,
  startTime: 1,
  endTime: 5,
  captionsEnabled: false,
  captionPosition: { x: 0.5, y: 0.72 },
  previewFontSize: 48,
  captionEdits: [{ id: "a", text: "My phrase", highlights: ["phrase"] }],
};

describe("clip editing", () => {
  it("projects source timing and edits without filling transcript gaps", () => {
    expect(projectCaptionLines(baseline, input)).toEqual([
      { id: "a", startTime: 1, endTime: 2, text: "My phrase", highlights: ["phrase"] },
      { id: "b", startTime: 4, endTime: 5, text: "Second phrase", highlights: [] },
    ]);
    expect(projectCaptionLines(baseline, { ...input, startTime: 2, endTime: 4 })).toEqual([]);
  });
  it("preserves edits when shrinking and extending again", () => {
    projectCaptionLines(baseline, { ...input, startTime: 4, endTime: 5 });
    expect(projectCaptionLines(baseline, { ...input, startTime: 0, endTime: 6 })[0]?.text).toBe(
      "My phrase",
    );
  });
  it("accepts disabled captions and full-source trims", () => {
    expect(clipEditInputSchema.parse(input).captionsEnabled).toBe(false);
    expect(validateClipEdit({ ...input, startTime: 0, endTime: 6 }, baseline, 6)).toBeNull();
  });
  it("rejects invalid ranges, source overrun, unknown and duplicate line IDs", () => {
    expect(validateClipEdit({ ...input, endTime: 1 }, baseline, 6)).toBe("CLIP_INVALID_TIME_RANGE");
    expect(validateClipEdit({ ...input, endTime: 7 }, baseline, 6)).toBe(
      "CLIP_OUTSIDE_SOURCE_DURATION",
    );
    expect(
      validateClipEdit(
        { ...input, captionEdits: [{ id: "unknown", text: "x", highlights: [] }] },
        baseline,
        6,
      ),
    ).toBe("CLIP_INVALID_CAPTION_METADATA");
    expect(
      clipEditInputSchema.safeParse({
        ...input,
        captionEdits: [input.captionEdits[0], input.captionEdits[0]],
      }).success,
    ).toBe(false);
  });
  it("rejects extra fields, non-finite times and invalid settings", () => {
    for (const patch of [
      { selected: true },
      { startTime: NaN },
      { previewFontSize: 97 },
      { captionPosition: { x: 2, y: 0 } },
    ]) {
      expect(clipEditInputSchema.safeParse({ ...input, ...patch }).success).toBe(false);
    }
  });
  it("does not truncate a long user-selected range to 200 lines", () => {
    const lines = Array.from({ length: 350 }, (_, i) => ({
      id: `${i}`,
      startTime: i,
      endTime: i + 1,
      text: "Words",
    }));
    expect(
      projectCaptionLines(lines, { ...input, captionEdits: [], startTime: 0, endTime: 350 }),
    ).toHaveLength(350);
  });
});
