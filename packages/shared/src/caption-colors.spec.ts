import { describe, expect, it } from "vitest";
import { captionEditSchema, clipEditInputSchema, projectCaptionLines } from "./clip-editor";

describe("caption colors", () => {
  it("preserves independently colored highlights through projection", () => {
    const edit = captionEditSchema.parse({
      id: "a",
      text: "Hello world",
      highlights: ["Hello", "world"],
      highlightColors: { hello: "#FF0000", world: "#00FF00" },
    });
    const [line] = projectCaptionLines(
      [{ id: "a", text: "Hello world", startTime: 1, endTime: 2 }],
      { startTime: 0, endTime: 3, captionEdits: [edit] },
    );
    expect(line?.highlightColors).toEqual({ hello: "#FF0000", world: "#00FF00" });
  });
  it("rejects CSS expressions and colors unrelated to a highlight", () => {
    for (const highlightColors of [{ hello: "red" }, { hello: "url(x)" }, { other: "#FFFFFF" }]) {
      expect(
        captionEditSchema.safeParse({
          id: "a",
          text: "Hello",
          highlights: ["Hello"],
          highlightColors,
        }).success,
      ).toBe(false);
    }
  });
  it("leaves omitted new settings omitted for old clients", () => {
    const input = clipEditInputSchema.parse({
      expectedRevision: 0,
      startTime: 0,
      endTime: 1,
      captionsEnabled: true,
      captionPosition: { x: 0.5, y: 0.72 },
      previewFontSize: 48,
      captionEdits: [],
    });
    expect(input).not.toHaveProperty("captionTextColor");
    expect(input).not.toHaveProperty("framing");
  });
});
