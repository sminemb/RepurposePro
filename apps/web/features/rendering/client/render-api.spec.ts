import { describe, it, expect, vi, afterEach } from "vitest";
import { startClipRender } from "./render-api";
afterEach(() => vi.unstubAllGlobals());
describe("render requests", () => {
  const clip = "00000000-0000-4000-8000-000000000001";
  it("sends the saved revision with a stable retry key and session credentials", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        Response.json({ data: { jobId: clip, status: "queued", outputCount: 1 } }),
      );
    vi.stubGlobal("fetch", fetch);
    await startClipRender(
      "http://localhost:4000/api/v1",
      "project",
      { type: "clips", clipIds: [clip], expectedRevision: 7 },
      "attempt",
    );
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({
      credentials: "include",
      headers: { "Idempotency-Key": "attempt" },
    });
    const options = fetch.mock.calls[0]?.[1] as RequestInit;
    expect(typeof options.body).toBe("string");
    expect(JSON.parse(options.body as string)).toMatchObject({ expectedRevision: 7 });
  });
  it("preserves a conflict error instead of navigating to an export", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ error: { message: "Changed elsewhere" } }, { status: 409 }),
        ),
    );
    await expect(
      startClipRender(
        "http://localhost",
        "project",
        { type: "clips", clipIds: [clip], expectedRevision: 7 },
        "attempt",
      ),
    ).rejects.toThrow("Changed elsewhere");
  });
});
