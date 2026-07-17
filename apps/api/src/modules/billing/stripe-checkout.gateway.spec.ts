import { describe, expect, it, vi } from "vitest";

import { StripeCheckoutGateway } from "./stripe-checkout.gateway";

describe("StripeCheckoutGateway", () => {
  it("creates one payment-mode session from trusted service input", async () => {
    const create = vi.fn().mockResolvedValue({ url: "https://checkout.stripe.com/c/pay_test" });
    const createClient = vi.fn().mockReturnValue({ checkout: { sessions: { create } } });
    const gateway = new StripeCheckoutGateway(createClient);

    await expect(
      gateway.createSession({
        cancelUrl: "https://app.example.test/billing?checkout=cancelled",
        customerEmail: "creator@example.test",
        packCode: "creator",
        priceId: "price_creator",
        secretKey: "sk_test_checkout",
        successUrl: "https://app.example.test/billing?checkout=success",
        userId: "user-1",
      }),
    ).resolves.toEqual({ url: "https://checkout.stripe.com/c/pay_test" });

    expect(createClient).toHaveBeenCalledWith("sk_test_checkout");
    expect(create).toHaveBeenCalledWith({
      cancel_url: "https://app.example.test/billing?checkout=cancelled",
      client_reference_id: "user-1",
      customer_email: "creator@example.test",
      line_items: [{ price: "price_creator", quantity: 1 }],
      metadata: { packCode: "creator", userId: "user-1" },
      mode: "payment",
      success_url: "https://app.example.test/billing?checkout=success",
    });
  });
});
