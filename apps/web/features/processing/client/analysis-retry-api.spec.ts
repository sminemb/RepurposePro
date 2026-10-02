import { afterEach, describe, expect, it, vi } from "vitest";

import { loadAnalysisRetryDetails, RetainedUploadUnavailableError } from "./analysis-retry-api";

afterEach(() => vi.unstubAllGlobals());

describe("fresh analysis cost confirmation", () => {
  it("refreshes the retained upload and balance without starting or charging analysis", async () => {
    const metadata = { requiredCredits: 11, hasAudio: true, expiresAt: "2099-01-01T00:00:00Z" };
    const balance = { balance: 42, unit: "credits" };
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ data: metadata }))
      .mockResolvedValueOnce(Response.json({ data: balance }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetcher);
    expect(await loadAnalysisRetryDetails("https://api.example.test/", "project")).toEqual({
      metadata,
      balance,
    });
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      "https://api.example.test/projects/project/video",
      "https://api.example.test/billing/credits",
      "https://api.example.test/projects/project/source-video/content",
    ]);
    expect(
      fetcher.mock.calls.every(
        ([, options]) =>
          options?.credentials === "include" && options.cache === "no-store" && !options.body,
      ),
    ).toBe(true);
  });

  it("rejects a missing retained file even when metadata still exists", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          Response.json({
            data: { requiredCredits: 11, hasAudio: true, expiresAt: "2099-01-01T00:00:00Z" },
          }),
        )
        .mockResolvedValueOnce(Response.json({ data: { balance: 42, unit: "credits" } }))
        .mockResolvedValueOnce(new Response(null, { status: 404 })),
    );
    await expect(
      loadAnalysisRetryDetails("https://api.example.test", "project"),
    ).rejects.toBeInstanceOf(RetainedUploadUnavailableError);
  });

  it.each([null, { hasAudio: true, requiredCredits: 11, expiresAt: "2020-01-01T00:00:00Z" }])(
    "explains an unavailable or expired upload before charging",
    async (metadata) => {
      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockResolvedValueOnce(
            metadata ? Response.json({ data: metadata }) : new Response(null, { status: 404 }),
          )
          .mockResolvedValueOnce(Response.json({ data: { balance: 42, unit: "credits" } })),
      );
      await expect(
        loadAnalysisRetryDetails("https://api.example.test", "project"),
      ).rejects.toBeInstanceOf(RetainedUploadUnavailableError);
    },
  );
});
