import { afterEach, describe, expect, it, vi } from "vitest";
import { requestClipEditor } from "./clip-editor-api";

afterEach(() => vi.unstubAllGlobals());
describe("clip editor requests", () => {
  it("gives a useful retry message on connection failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await expect(requestClipEditor("https://example.test", "project", "clip")).rejects.toThrow(
      "Check your connection",
    );
  });
  it("does not retry an edit conflict", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 409 }));
    vi.stubGlobal("fetch", fetch);
    await expect(requestClipEditor("https://example.test", "project", "clip")).rejects.toThrow(
      "changed elsewhere",
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
