import { describe, expect, it, vi } from "vitest";

import { StripeCheckoutGateway } from "./stripe-checkout.gateway";

describe("StripeCheckoutGateway", () => {
  it("creates one payment-mode session from trusted service input", async () => {
    const create = vi.fn().mockResolvedValue({
      expires_at: 1_785_052_000,
      id: "cs_test",
      url: "https://checkout.stripe.com/c/pay_test",
    });
    const createClient = vi.fn().mockReturnValue({ checkout: { sessions: { create } } });
    const gateway = new StripeCheckoutGateway(createClient);
    const request = {
      attemptId: "00000000-0000-4000-8000-000000000701",
      cancelUrl: "https://app.example.test/billing?checkout=cancelled",
      customerEmail: "creator@example.test",
      idempotencyKey: "checkout-attempt-1",
      priceId: "price_creator",
      secretKey: "sk_test_checkout",
      successUrl: "https://app.example.test/billing?checkout=success",
      userId: "user-1",
    };

    await expect(gateway.createSession(request)).resolves.toEqual({
      expires_at: 1_785_052_000,
      id: "cs_test",
      url: "https://checkout.stripe.com/c/pay_test",
    });

    expect(createClient).toHaveBeenCalledWith("sk_test_checkout");
    expect(create).toHaveBeenCalledWith(
      {
        cancel_url: "https://app.example.test/billing?checkout=cancelled",
        client_reference_id: "user-1",
        customer_email: "creator@example.test",
        line_items: [{ price: "price_creator", quantity: 1 }],
        metadata: { checkoutAttemptId: "00000000-0000-4000-8000-000000000701" },
        mode: "payment",
        payment_method_types: ["card"],
        success_url: "https://app.example.test/billing?checkout=success",
      },
      {
        idempotencyKey: "checkout-attempt-1",
      },
    );
  });
});
