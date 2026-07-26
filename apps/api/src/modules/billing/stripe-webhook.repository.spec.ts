import { describe, expect, it, vi } from "vitest";

import { StripeWebhookRepository } from "./stripe-webhook.repository";

describe("StripeWebhookRepository", () => {
  it("passes the complete authoritative Checkout identity to the grant function", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ outcome: "granted" }] });
    const repository = new StripeWebhookRepository({
      database: { pool: { query } },
    } as never);

    await repository.grantPurchase({
      amountCents: 2500,
      checkoutSessionId: "cs_test_creator",
      currency: "usd",
      eventId: "evt_test_creator",
      eventType: "checkout.session.completed",
      livemode: false,
      mode: "payment",
      paymentIntentId: "pi_test_creator",
      paymentStatus: "paid",
      priceId: "price_creator",
      quantity: 1,
      sessionStatus: "complete",
      userId: "user-1",
    });

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining(
        "public.grant_stripe_credit_purchase(\n        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13",
      ),
      [
        "evt_test_creator",
        "checkout.session.completed",
        "user-1",
        "cs_test_creator",
        "pi_test_creator",
        "price_creator",
        1,
        2500,
        "usd",
        false,
        "payment",
        "paid",
        "complete",
      ],
    );
  });

  it("records expiration through the scoped webhook function", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ outcome: "expired" }] });
    const repository = new StripeWebhookRepository({
      database: { pool: { query } },
    } as never);

    await repository.expireSession({
      checkoutSessionId: "cs_test_expired",
      eventId: "evt_test_expired",
      eventType: "checkout.session.expired",
    });

    expect(query).toHaveBeenCalledWith("SELECT public.expire_stripe_checkout_session($1, $2, $3)", [
      "evt_test_expired",
      "checkout.session.expired",
      "cs_test_expired",
    ]);
  });
});
