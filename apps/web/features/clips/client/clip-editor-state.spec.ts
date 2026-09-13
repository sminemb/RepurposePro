import { describe, expect, it } from "vitest";
import {
  captionHighlightParts,
  draftInput,
  editorDraft,
  rebaseSavedDraft,
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
  it("keeps incomplete trim input invalid instead of coercing it to zero", () => {
    expect(draftInput({ ...editorDraft(input), startText: "" })).toBeNull();
    expect(draftInput({ ...editorDraft(input), startText: "1.234" })?.startTime).toBe(1.234);
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
});
