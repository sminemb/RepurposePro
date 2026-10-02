import { afterEach, describe, expect, it, vi } from "vitest";
import { deleteClip } from "./clip-management-api";
afterEach(() => vi.unstubAllGlobals());
describe("clip deletion", () => {
  it("sends the saved revision and handles an empty 204 response", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetch);
    await expect(deleteClip("https://api.test/", "project", "clip", 7)).resolves.toBeUndefined();
    expect(fetch.mock.calls[0]![1]).toMatchObject({
      method: "DELETE",
      credentials: "include",
      body: JSON.stringify({ expectedRevision: 7 }),
    });
  });
  it("preserves the candidate on a conflict", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { message: "Wait for rendering." } }), {
          status: 409,
        }),
      ),
    );
    await expect(deleteClip("https://api.test", "project", "clip", 0)).rejects.toThrow(
      "Wait for rendering.",
    );
  });
});
