import { describe, expect, it } from "vitest";
import { bulkClipDeleteInputSchema } from "./clip-management";

const clip = { id: "00000000-0000-4000-8000-000000000001", expectedRevision: 2 };
describe("bulk clip deletion input", () => {
  it("accepts five clips with their saved revisions", () => {
    const clips = Array.from({ length: 5 }, (_, i) => ({
      ...clip,
      id: `00000000-0000-4000-8000-00000000000${i + 1}`,
    }));
    expect(bulkClipDeleteInputSchema.parse({ clips })).toEqual({ clips });
  });
  it("rejects empty, duplicate, malformed, oversized and stale-shaped batches", () => {
    for (const clips of [
      [],
      [clip, clip],
      [{ ...clip, expectedRevision: -1 }],
      [{ ...clip, id: "foreign" }],
      [{ id: clip.id }],
      Array(101).fill(clip),
    ]) {
      expect(bulkClipDeleteInputSchema.safeParse({ clips }).success).toBe(false);
    }
  });
});
