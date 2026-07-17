import { beforeEach, describe, expect, it, vi } from "vitest";

const { requestApiMock } = vi.hoisted(() => ({ requestApiMock: vi.fn() }));

vi.mock("@/lib/server-api", () => ({ requestApi: requestApiMock }));
vi.mock("server-only", () => ({}));

import { createCheckoutSession, getCreditBalance } from "./billing-api";

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

describe("createCheckoutSession", () => {
  beforeEach(() => {
    requestApiMock.mockReset();
  });

  it("posts only an approved pack and returns server-issued Checkout URL", async () => {
    requestApiMock.mockResolvedValue(
      Response.json(
        { data: { checkoutUrl: "https://checkout.stripe.com/c/pay_test" } },
        { status: 201 },
      ),
    );

    await expect(createCheckoutSession("creator")).resolves.toEqual({
      checkoutUrl: "https://checkout.stripe.com/c/pay_test",
      kind: "success",
    });
    expect(requestApiMock).toHaveBeenCalledWith("/billing/checkout", {
      body: JSON.stringify({ pack: "creator" }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
  });

  it("does not redirect on unavailable or malformed Checkout response", async () => {
    requestApiMock.mockResolvedValue(
      Response.json({ data: { checkoutUrl: "https://example.test" } }),
    );

    await expect(createCheckoutSession("starter")).resolves.toEqual({
      kind: "unavailable",
      message: "Checkout is temporarily unavailable. Try again.",
    });
  });
});
