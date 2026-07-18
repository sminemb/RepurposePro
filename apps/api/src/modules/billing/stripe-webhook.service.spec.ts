import { beforeEach, describe, expect, it, vi } from "vitest";

const { loadApiConfigMock } = vi.hoisted(() => ({ loadApiConfigMock: vi.fn() }));

vi.mock("@repurposepro/config", () => ({ loadApiConfig: loadApiConfigMock }));

import { InvalidStripeWebhookSignatureError, StripeWebhookService } from "./stripe-webhook.service";

const webhookConfig = {
  stripe: {
    secretKey: "sk_test_checkouttests",
    webhookSecret: "whsec_checkouttests",
  },
};

function paidCheckoutCompletedEvent(overrides: Record<string, unknown> = {}): unknown {
  return {
    data: {
      object: {
        amount_total: 2500,
        client_reference_id: "user-1",
        currency: "usd",
        id: "cs_test_creator",
        metadata: { packCode: "creator" },
        mode: "payment",
        payment_intent: "pi_test_creator",
        payment_status: "paid",
        status: "complete",
        ...overrides,
      },
    },
    id: "evt_test_creator",
    type: "checkout.session.completed",
  };
}

describe("StripeWebhookService", () => {
  const constructEvent = vi.fn();
  const grantPurchase = vi.fn();
  const recordIgnored = vi.fn();
  const service = new StripeWebhookService({ constructEvent }, { grantPurchase, recordIgnored });
  const payload = Buffer.from('{"test":true}');

  beforeEach(() => {
    constructEvent.mockReset();
    grantPurchase.mockReset();
    recordIgnored.mockReset();
    loadApiConfigMock.mockReturnValue(webhookConfig);
  });

  it("verifies the raw payload and grants exactly one trusted paid Checkout purchase", async () => {
    constructEvent.mockReturnValue(paidCheckoutCompletedEvent());

    await expect(service.handle(payload, "signature_test")).resolves.toBeUndefined();

    expect(constructEvent).toHaveBeenCalledWith(
      payload,
      "signature_test",
      "sk_test_checkouttests",
      "whsec_checkouttests",
    );
    expect(grantPurchase).toHaveBeenCalledWith({
      amountCents: 2500,
      checkoutSessionId: "cs_test_creator",
      credits: 100,
      currency: "usd",
      eventId: "evt_test_creator",
      eventType: "checkout.session.completed",
      packCode: "creator",
      paymentIntentId: "pi_test_creator",
      userId: "user-1",
    });
    expect(recordIgnored).not.toHaveBeenCalled();
  });

  it("rejects an unverifiable payload before touching payment records", async () => {
    constructEvent.mockImplementation(() => {
      throw new Error("signature verification failed");
    });

    await expect(service.handle(payload, "bad_signature")).rejects.toBeInstanceOf(
      InvalidStripeWebhookSignatureError,
    );
    expect(grantPurchase).not.toHaveBeenCalled();
    expect(recordIgnored).not.toHaveBeenCalled();
  });

  it.each([
    ["an unpaid session", { payment_status: "unpaid" }],
    ["a session with a mismatched amount", { amount_total: 999 }],
    ["a session without a trusted user correlation", { client_reference_id: null }],
  ])("records %s without granting credits", async (_label, overrides) => {
    constructEvent.mockReturnValue(paidCheckoutCompletedEvent(overrides));

    await expect(service.handle(payload, "signature_test")).resolves.toBeUndefined();

    expect(recordIgnored).toHaveBeenCalledWith({
      eventId: "evt_test_creator",
      eventType: "checkout.session.completed",
    });
    expect(grantPurchase).not.toHaveBeenCalled();
  });

  it("records unrelated signed Stripe events without granting credits", async () => {
    constructEvent.mockReturnValue({
      data: { object: {} },
      id: "evt_test_unrelated",
      type: "customer.created",
    });

    await expect(service.handle(payload, "signature_test")).resolves.toBeUndefined();

    expect(recordIgnored).toHaveBeenCalledWith({
      eventId: "evt_test_unrelated",
      eventType: "customer.created",
    });
    expect(grantPurchase).not.toHaveBeenCalled();
  });
});
