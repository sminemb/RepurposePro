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
    livemode: false,
    secretKey: "sk_test_checkout",
    successUrl: "https://app.example.test/billing?checkout=success",
  },
};

describe("CheckoutService", () => {
  const attach = vi.fn();
  const createAttempt = vi.fn();
  const createSession = vi.fn();
  const fail = vi.fn();
  const service = new CheckoutService({ createSession }, { attach, createAttempt, fail });

  beforeEach(() => {
    attach.mockReset();
    createAttempt.mockReset();
    createSession.mockReset();
    fail.mockReset();
    createAttempt.mockResolvedValue({
      attemptId: "00000000-0000-4000-8000-000000000001",
      idempotencyKey: "stripe-checkout:00000000-0000-4000-8000-000000000001",
    });
    loadApiConfigMock.mockReturnValue(checkoutConfig);
  });

  it("uses server config and authenticated identity to create one trusted Checkout session", async () => {
    createSession.mockResolvedValue({
      expires_at: 1_800_000_000,
      id: "cs_test_creator",
      url: "https://checkout.stripe.com/c/pay_test",
    });

    await expect(
      service.create({ email: "creator@example.test", id: "user-1" }, "creator"),
    ).resolves.toEqual({ checkoutUrl: "https://checkout.stripe.com/c/pay_test" });

    expect(createAttempt).toHaveBeenCalledWith("user-1", "creator", "price_creator", false);
    expect(createSession).toHaveBeenCalledWith({
      attemptId: "00000000-0000-4000-8000-000000000001",
      cancelUrl: "https://app.example.test/billing?checkout=cancelled",
      customerEmail: "creator@example.test",
      idempotencyKey: "stripe-checkout:00000000-0000-4000-8000-000000000001",
      priceId: "price_creator",
      secretKey: "sk_test_checkout",
      successUrl: "https://app.example.test/billing?checkout=success",
      userId: "user-1",
    });
    expect(attach).toHaveBeenCalledWith(
      "00000000-0000-4000-8000-000000000001",
      "cs_test_creator",
      new Date(1_800_000_000_000),
    );
  });

  it.each([null, "https://example.test/not-stripe", "not-a-url"])(
    "fails closed when Stripe returns an unsafe Checkout URL: %s",
    async (url) => {
      createSession.mockResolvedValue({
        expires_at: 1_800_000_000,
        id: "cs_test_starter",
        url,
      });

      await expect(
        service.create({ email: "creator@example.test", id: "user-1" }, "starter"),
      ).rejects.toBeInstanceOf(CheckoutUnavailableError);
      expect(fail).toHaveBeenCalledWith("00000000-0000-4000-8000-000000000001");
    },
  );

  it("leaves an attached Stripe session ungrantable when correlation persistence fails", async () => {
    createSession.mockResolvedValue({
      expires_at: 1_800_000_000,
      id: "cs_test_creator",
      url: "https://checkout.stripe.com/c/pay_test",
    });
    attach.mockRejectedValue(new Error("database unavailable"));

    await expect(
      service.create({ email: "creator@example.test", id: "user-1" }, "creator"),
    ).rejects.toBeInstanceOf(CheckoutUnavailableError);

    expect(fail).not.toHaveBeenCalled();
  });
});
