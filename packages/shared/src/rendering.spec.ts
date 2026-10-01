import { describe, expect, it } from "vitest";
import { renderClipInputSchema, renderSnapshotSchema } from "./rendering";

describe("one clip render contract", () => {
  const input = {
    type: "clips",
    clipIds: ["00000000-0000-4000-8000-000000000001"],
    expectedRevision: 3,
  };
  it("requires one saved clip revision", () => {
    expect(renderClipInputSchema.parse(input)).toEqual(input);
    expect(renderClipInputSchema.safeParse({ ...input, clipIds: [] }).success).toBe(false);
    expect(
      renderClipInputSchema.safeParse({ ...input, clipIds: [...input.clipIds, ...input.clipIds] })
        .success,
    ).toBe(false);
    expect(renderClipInputSchema.safeParse({ ...input, expectedRevision: -1 }).success).toBe(false);
    expect(renderClipInputSchema.safeParse({ ...input, type: "summary" }).success).toBe(false);
  });
  it("does not accept client filesystem paths", () => {
    expect(renderClipInputSchema.safeParse({ ...input, sourcePath: "elsewhere" }).success).toBe(
      false,
    );
    expect(renderSnapshotSchema.safeParse({ clip: {} }).success).toBe(false);
  });
});
