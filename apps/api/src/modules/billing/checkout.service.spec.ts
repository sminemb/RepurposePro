import { beforeEach, describe, expect, it, vi } from "vitest";

const { loadApiConfigMock } = vi.hoisted(() => ({ loadApiConfigMock: vi.fn() }));

vi.mock("@repurposepro/config", () => ({ loadApiConfig: loadApiConfigMock }));

import { CheckoutUnavailableError, CheckoutService } from "./checkout.service";

const checkoutConfig = {
  stripe: {
    cancelUrl: "https://app.example.test/billing?checkout=cancelled",
    priceIds: {
      creator: "price_creator",
      pro: "price_pro",
      starter: "price_starter",
    },
    secretKey: "sk_test_checkout",
    successUrl: "https://app.example.test/billing?checkout=success",
  },
};

describe("CheckoutService", () => {
  const createSession = vi.fn();
  const service = new CheckoutService({ createSession });

  beforeEach(() => {
    createSession.mockReset();
    loadApiConfigMock.mockReturnValue(checkoutConfig);
  });

  it("uses server config and authenticated identity to create one trusted Checkout session", async () => {
    createSession.mockResolvedValue({ url: "https://checkout.stripe.com/c/pay_test" });

    await expect(
      service.create({ email: "creator@example.test", id: "user-1" }, "creator"),
    ).resolves.toEqual({ checkoutUrl: "https://checkout.stripe.com/c/pay_test" });

    expect(createSession).toHaveBeenCalledWith({
      cancelUrl: "https://app.example.test/billing?checkout=cancelled",
      customerEmail: "creator@example.test",
      packCode: "creator",
      priceId: "price_creator",
      secretKey: "sk_test_checkout",
      successUrl: "https://app.example.test/billing?checkout=success",
      userId: "user-1",
    });
  });

  it.each([null, "https://example.test/not-stripe", "not-a-url"])(
    "fails closed when Stripe returns an unsafe Checkout URL: %s",
    async (url) => {
      createSession.mockResolvedValue({ url });

      await expect(
        service.create({ email: "creator@example.test", id: "user-1" }, "starter"),
      ).rejects.toBeInstanceOf(CheckoutUnavailableError);
    },
  );
});
