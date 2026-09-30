import { describe, it, expect, vi } from "vitest";
import type { ClipEditor } from "@repurposepro/shared";
import { prepareClipRender } from "./prepare-clip-render";

describe("save before rendering", () => {
  it("waits for the response and returns its actual persisted revision", async () => {
    let revision = 4,
      finish!: () => void;
    const saving = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const prepared = prepareClipRender({
      blocked: false,
      dirty: true,
      save: async () => {
        await saving;
        revision = 7;
        return true;
      },
      isCurrent: () => true,
      getSaved: () => ({ clip: { revision } }) as ClipEditor,
    });
    let settled = false;
    void prepared.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    finish();
    expect((await prepared)?.clip.revision).toBe(7);
  });
  it("prevents rendering when edits arrive during saving, or the save conflicts", async () => {
    const getSaved = vi.fn();
    expect(
      await prepareClipRender({
        blocked: false,
        dirty: true,
        save: () => Promise.resolve(false),
        isCurrent: () => true,
        getSaved,
      }),
    ).toBeNull();
    expect(
      await prepareClipRender({
        blocked: false,
        dirty: true,
        save: () => Promise.resolve(true),
        isCurrent: () => false,
        getSaved,
      }),
    ).toBeNull();
    expect(getSaved).not.toHaveBeenCalled();
  });
  it("rejects validation, recovery and in-flight saves before calling save", async () => {
    const save = vi.fn();
    expect(
      await prepareClipRender({
        blocked: true,
        dirty: true,
        save,
        isCurrent: () => true,
        getSaved: vi.fn(),
      }),
    ).toBeNull();
    expect(save).not.toHaveBeenCalled();
  });
});
