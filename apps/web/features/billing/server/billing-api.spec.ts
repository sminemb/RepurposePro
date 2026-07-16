import { beforeEach, describe, expect, it, vi } from "vitest";

const { requestApiMock } = vi.hoisted(() => ({ requestApiMock: vi.fn() }));

vi.mock("@/lib/server-api", () => ({ requestApi: requestApiMock }));
vi.mock("server-only", () => ({}));

import { getCreditBalance } from "./billing-api";

describe("getCreditBalance", () => {
  beforeEach(() => {
    requestApiMock.mockReset();
  });

  it("returns the documented balance without inventing a fallback value", async () => {
    requestApiMock.mockResolvedValue(
      Response.json({
        data: { balance: 89, conversion: "1 credit = 1 video minute", unit: "credits" },
      }),
    );

    await expect(getCreditBalance()).resolves.toEqual({
      balance: { balance: 89, conversion: "1 credit = 1 video minute", unit: "credits" },
      kind: "success",
    });
    expect(requestApiMock).toHaveBeenCalledWith("/billing/credits");
  });

  it("separates expired authentication from balance availability failures", async () => {
    requestApiMock.mockResolvedValue(Response.json({ error: {} }, { status: 401 }));

    await expect(getCreditBalance()).resolves.toEqual({ kind: "unauthenticated" });
  });

  it("never converts a failed balance request into a zero balance", async () => {
    requestApiMock.mockResolvedValue(Response.json({ error: {} }, { status: 503 }));

    await expect(getCreditBalance()).resolves.toEqual({
      kind: "unavailable",
      message: "We could not load your credit balance. Refresh the page to try again.",
    });
  });
});
