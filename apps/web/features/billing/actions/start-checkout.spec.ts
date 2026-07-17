import { beforeEach, describe, expect, it, vi } from "vitest";

const { createCheckoutSessionMock } = vi.hoisted(() => ({
  createCheckoutSessionMock: vi.fn(),
}));

vi.mock("../server/billing-api", () => ({
  createCheckoutSession: createCheckoutSessionMock,
}));

import { startCheckout } from "./start-checkout";

describe("startCheckout", () => {
  beforeEach(() => {
    createCheckoutSessionMock.mockReset();
  });

  it("submits only the selected pack and returns the API Checkout URL", async () => {
    createCheckoutSessionMock.mockResolvedValue({
      checkoutUrl: "https://checkout.stripe.com/c/pay_test",
      kind: "success",
    });

    const formData = new FormData();
    formData.set("pack", "creator");

    await expect(startCheckout({ checkoutUrl: null, error: null }, formData)).resolves.toEqual({
      checkoutUrl: "https://checkout.stripe.com/c/pay_test",
      error: null,
    });
    expect(createCheckoutSessionMock).toHaveBeenCalledWith("creator");
  });

  it("rejects tampered packs before calling the API", async () => {
    const formData = new FormData();
    formData.set("pack", "enterprise");

    await expect(startCheckout({ checkoutUrl: null, error: null }, formData)).resolves.toEqual({
      checkoutUrl: null,
      error: "Choose a valid credit pack and try again.",
    });
    expect(createCheckoutSessionMock).not.toHaveBeenCalled();
  });

  it("keeps Checkout errors on the billing page", async () => {
    createCheckoutSessionMock.mockResolvedValue({
      kind: "unavailable",
      message: "Checkout is temporarily unavailable. Try again.",
    });

    const formData = new FormData();
    formData.set("pack", "starter");

    await expect(startCheckout({ checkoutUrl: null, error: null }, formData)).resolves.toEqual({
      checkoutUrl: null,
      error: "Checkout is temporarily unavailable. Try again.",
    });
  });
});
