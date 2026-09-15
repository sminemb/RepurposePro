import { describe, expect, it, vi } from "vitest";

import type { DatabaseService } from "../infrastructure/database.service";
import { ClipEditorError, ClipEditorService } from "./clip-editor.service";

const input = {
  expectedRevision: 0,
  startTime: 0,
  endTime: 10,
  captionsEnabled: false,
  captionPosition: { x: 0.5, y: 0.72 },
  previewFontSize: 48,
  captionEdits: [],
};

describe("ClipEditorService", () => {
  it("keeps owner and both resource IDs in the database call", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ result: null }] });
    const service = new ClipEditorService({
      database: { pool: { query } },
    } as unknown as DatabaseService);
    await expect(service.get("owner", "project", "clip")).rejects.toMatchObject({
      code: "CLIP_NOT_FOUND",
    });
    expect(query.mock.calls[0]?.[1]).toEqual(["owner", "project", "clip"]);
  });
  it("surfaces stale revisions and never retries an overwrite", async () => {
    const query = vi
      .fn()
      .mockResolvedValue({ rows: [{ result: { outcome: "CLIP_EDIT_CONFLICT" } }] });
    const service = new ClipEditorService({
      database: { pool: { query } },
    } as unknown as DatabaseService);
    await expect(service.save("owner", "project", "clip", input)).rejects.toMatchObject({
      code: "CLIP_EDIT_CONFLICT",
    });
    expect(query).toHaveBeenCalledTimes(1);
  });
  it("does not expose unexpected database responses as valid editor state", async () => {
    const query = vi
      .fn()
      .mockResolvedValue({ rows: [{ result: { outcome: "saved", editor: {} } }] });
    const service = new ClipEditorService({
      database: { pool: { query } },
    } as unknown as DatabaseService);
    await expect(service.save("owner", "project", "clip", input)).rejects.not.toBeInstanceOf(
      ClipEditorError,
    );
  });
});
