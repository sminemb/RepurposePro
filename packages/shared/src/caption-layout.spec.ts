import { describe, it, expect } from "vitest";
import { captionHighlightParts, captionLayout, captionLayoutParts } from "./caption-layout";
describe("shared caption layout", () => {
  it("preserves wrapped phrase colors and uppercase Unicode expansions", () => {
    const layout = captionLayout(
      "wide straße idea",
      { x: 0.5, y: 0.72 },
      64,
      (text) => text.length * 100,
    );
    const parts = captionLayoutParts(layout, ["straße idea"], { "straße idea": "#00ff00" });
    expect(
      parts
        .flat()
        .filter((part) => part.highlighted)
        .map((part) => part.text)
        .join(" "),
    ).toBe("STRASSE IDEA");
    expect(
      parts
        .flat()
        .filter((part) => part.highlighted)
        .every((part) => part.color === "#00ff00"),
    ).toBe(true);
  });
  it("matches whole Unicode phrases, longest first, preserving highlight colors", () => {
    expect(
      captionHighlightParts("Burn out burnout café", ["burn", "burn out", "café"], {
        "burn out": "#00ff00",
      }),
    ).toEqual([
      { text: "Burn out", highlighted: true, color: "#00ff00" },
      { text: " burnout ", highlighted: false },
      { text: "café", highlighted: true },
    ]);
  });
  it("wraps long words and preserves the 1080px reference", () => {
    const measure = (text: string) => text.length * 40;
    const layout = captionLayout(
      "A long caption with averylongunbrokenword",
      { x: 0.5, y: 0.72 },
      64,
      measure,
    );
    expect(layout.lines.length).toBeGreaterThan(1);
    expect(layout.width).toBeLessThanOrEqual(1080 * 0.88);
    expect(layout.centerX).toBe(540);
    expect(layout.centerY).toBe(1920 * 0.72);
    expect(layout.lines.every((line) => measure(line) <= 1080 * 0.88 - 72)).toBe(true);
  });
});
