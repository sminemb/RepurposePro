import { describe, expect, it } from "vitest";
import {
  captionHighlightParts,
  draftInput,
  editorDraft,
  rebaseSavedDraft,
  trimValidation,
} from "./clip-editor-state";

const input = {
  expectedRevision: 0,
  startTime: 0,
  endTime: 10,
  captionsEnabled: true,
  captionPosition: { x: 0.5, y: 0.72 },
  previewFontSize: 48,
  captionEdits: [],
};
describe("editor draft state", () => {
  it.each([1, 2, 1000])("accepts a one-millisecond trim starting at %ss", (start) => {
    expect(
      trimValidation(editorDraft({ ...input, startTime: start, endTime: start + 0.001 }), 1800),
    ).toBe("");
  });
  it("rejects incomplete, collapsed and out-of-source trims", () => {
    const draft = editorDraft(input);
    for (const patch of [
      { startText: "" },
      { endText: "NaN" },
      { startText: "-00:00:01" },
      { startText: "00:00:01", endText: "00:00:01.0001" },
      { startText: "00:00:02", endText: "00:00:01" },
      { endText: "00:00:11" },
    ]) {
      expect(trimValidation({ ...draft, ...patch }, 10)).not.toBe("");
    }
  });
  it("keeps incomplete trim input invalid instead of coercing it to zero", () => {
    expect(draftInput({ ...editorDraft(input), startText: "" })).toBeNull();
    expect(draftInput({ ...editorDraft(input), startText: "00:00:01.234" })?.startTime).toBe(1.234);
  });
  it("initializes formatted drafts and saves numeric source timestamps", () => {
    const draft = editorDraft({ ...input, startTime: 4, endTime: 342.6 });
    expect(draft).toMatchObject({ startText: "00:00:04.000", endText: "00:05:42.600" });
    expect(draftInput(draft)).toEqual({ ...input, startTime: 4, endTime: 342.6 });
    expect(trimValidation({ ...draft, endText: "00:00:" }, 400)).not.toBe("");
    expect(draftInput({ ...draft, endText: "00:00:" })).toBeNull();
  });
  it("rebases the revision without erasing edits made during a save", () => {
    const submitted = editorDraft(input);
    const latest = { ...submitted, captionsEnabled: false };
    const saved = { ...input, expectedRevision: 1 };
    expect(rebaseSavedDraft(latest, submitted, saved)).toMatchObject({
      captionsEnabled: false,
      expectedRevision: 1,
    });
    expect(rebaseSavedDraft(submitted, submitted, saved)).toEqual(editorDraft(saved));
  });
  it("highlights whole words and longest phrases, preserving original text safely", () => {
    const parts = captionHighlightParts("BURN OUT, burnout <script>", [
      "burn",
      "burn out",
      "<script>",
    ]);
    expect(parts.filter((part) => part.highlighted).map((part) => part.text)).toEqual([
      "BURN OUT",
      "<script>",
    ]);
    expect(parts.map((part) => part.text).join("")).toBe("BURN OUT, burnout <script>");
  });
  it("uses separate phrase colors without reading inherited properties", () => {
    const parts = captionHighlightParts(
      "BURN OUT, constructor",
      ["burn", "burn out", "constructor"],
      {
        "burn out": "#22c55e",
        burn: "#ff0000",
      },
    );
    expect(parts.filter((part) => part.highlighted)).toEqual([
      { text: "BURN OUT", highlighted: true, color: "#22c55e" },
      { text: "constructor", highlighted: true },
    ]);
  });
});
