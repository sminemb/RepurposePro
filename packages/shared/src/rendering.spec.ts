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
  it("accepts one to ten unique revisions and rejects incomplete batch snapshots", () => {
    const second = "00000000-0000-4000-8000-000000000002";
    const batch = {
      type: "clips",
      clipIds: [input.clipIds[0], second],
      expectedRevisions: { [input.clipIds[0]]: 3, [second]: 7 },
    };
    expect(renderClipInputSchema.parse(batch)).toEqual(batch);
    expect(renderClipInputSchema.safeParse({ ...batch, clipIds: [second, second] }).success).toBe(
      false,
    );
    expect(
      renderClipInputSchema.safeParse({ ...batch, expectedRevisions: { [second]: 7 } }).success,
    ).toBe(false);
    expect(renderClipInputSchema.safeParse({ ...batch, expectedRevision: 3 }).success).toBe(false);
    expect(
      renderClipInputSchema.safeParse({
        ...batch,
        expectedRevisions: { ...batch.expectedRevisions, [second]: -1 },
      }).success,
    ).toBe(false);
  });
});
