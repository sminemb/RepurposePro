import { beforeEach, describe, expect, it, vi } from "vitest";

const { loadApiConfigMock } = vi.hoisted(() => ({ loadApiConfigMock: vi.fn() }));

vi.mock("@repurposepro/config", () => ({ loadApiConfig: loadApiConfigMock }));

import {
  InvalidStripeWebhookSignatureError,
  StripeWebhookProcessingError,
  StripeWebhookService,
} from "./stripe-webhook.service";

const webhookConfig = {
  stripe: {
    secretKey: "sk_test_checkouttests",
    webhookSecret: "whsec_checkouttests",
  },
};

function paidCheckoutCompletedEvent(): unknown {
  return {
    data: {
      object: {
        id: "cs_test_creator",
      },
    },
    id: "evt_test_creator",
    type: "checkout.session.completed",
  };
}

function retrievedPaidSession(overrides: Record<string, unknown> = {}): unknown {
  return {
    amount_total: 2500,
    client_reference_id: "user-1",
    currency: "usd",
    id: "cs_test_creator",
    line_items: {
      data: [{ price: { id: "price_creator" }, quantity: 1 }],
    },
    livemode: false,
    mode: "payment",
    payment_intent: "pi_test_creator",
    payment_status: "paid",
    status: "complete",
    ...overrides,
  };
}

describe("StripeWebhookService", () => {
  const constructEvent = vi.fn();
  const expireSession = vi.fn();
  const grantPurchase = vi.fn();
  const markFailed = vi.fn();
  const receive = vi.fn();
  const recordIgnored = vi.fn();
  const retrieveCheckoutSession = vi.fn();
  const service = new StripeWebhookService(
    { constructEvent, retrieveCheckoutSession },
    { expireSession, grantPurchase, markFailed, receive, recordIgnored },
  );
  const payload = Buffer.from('{"test":true}');

  beforeEach(() => {
    constructEvent.mockReset();
    expireSession.mockReset();
    grantPurchase.mockReset();
    markFailed.mockReset();
    receive.mockReset().mockResolvedValue("received");
    recordIgnored.mockReset();
    retrieveCheckoutSession.mockReset();
    loadApiConfigMock.mockReturnValue(webhookConfig);
  });

  it("verifies the raw payload and grants exactly one trusted paid Checkout purchase", async () => {
    constructEvent.mockReturnValue(paidCheckoutCompletedEvent());
    retrieveCheckoutSession.mockResolvedValue(retrievedPaidSession());

    await expect(service.handle(payload, "signature_test")).resolves.toBeUndefined();

    expect(constructEvent).toHaveBeenCalledWith(
      payload,
      "signature_test",
      "sk_test_checkouttests",
      "whsec_checkouttests",
    );
    expect(retrieveCheckoutSession).toHaveBeenCalledWith(
      "cs_test_creator",
      "sk_test_checkouttests",
    );
    expect(grantPurchase).toHaveBeenCalledWith({
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
    expect(receive).toHaveBeenCalledBefore(retrieveCheckoutSession);
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
    expect(receive).not.toHaveBeenCalled();
    expect(recordIgnored).not.toHaveBeenCalled();
  });

  it.each([
    ["an unpaid session", { payment_status: "unpaid" }],
    ["a session without a trusted user correlation", { client_reference_id: null }],
    ["a session with multiple line items", { line_items: { data: [{}, {}] } }],
  ])("persists %s as retryable without granting credits", async (_label, overrides) => {
    constructEvent.mockReturnValue(paidCheckoutCompletedEvent());
    retrieveCheckoutSession.mockResolvedValue(retrievedPaidSession(overrides));

    await expect(service.handle(payload, "signature_test")).rejects.toBeInstanceOf(
      StripeWebhookProcessingError,
    );

    expect(markFailed).toHaveBeenCalledWith(
      {
        eventId: "evt_test_creator",
        eventType: "checkout.session.completed",
      },
      "STRIPE_PURCHASE_CORRELATION_FAILED",
    );
    expect(recordIgnored).not.toHaveBeenCalled();
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
    expect(receive).toHaveBeenCalledBefore(recordIgnored);
    expect(grantPurchase).not.toHaveBeenCalled();
    expect(retrieveCheckoutSession).not.toHaveBeenCalled();
  });

  it("persists signed Checkout expiration without trusting purchase metadata", async () => {
    constructEvent.mockReturnValue({
      data: { object: { id: "cs_test_expired" } },
      id: "evt_test_expired",
      type: "checkout.session.expired",
    });

    await expect(service.handle(payload, "signature_test")).resolves.toBeUndefined();

    expect(expireSession).toHaveBeenCalledWith({
      checkoutSessionId: "cs_test_expired",
      eventId: "evt_test_expired",
      eventType: "checkout.session.expired",
    });
    expect(receive).toHaveBeenCalledBefore(expireSession);
    expect(retrieveCheckoutSession).not.toHaveBeenCalled();
  });

  it("fails for retry when authoritative Checkout retrieval is unavailable", async () => {
    constructEvent.mockReturnValue(paidCheckoutCompletedEvent());
    retrieveCheckoutSession.mockRejectedValue(new Error("Stripe unavailable"));

    await expect(service.handle(payload, "signature_test")).rejects.toBeInstanceOf(
      StripeWebhookProcessingError,
    );
    expect(markFailed).toHaveBeenCalledWith(
      {
        eventId: "evt_test_creator",
        eventType: "checkout.session.completed",
      },
      "STRIPE_CHECKOUT_RETRIEVAL_FAILED",
    );
    expect(grantPurchase).not.toHaveBeenCalled();
  });

  it("returns immediately for a durably processed duplicate receipt", async () => {
    constructEvent.mockReturnValue(paidCheckoutCompletedEvent());
    receive.mockResolvedValue("processed");

    await expect(service.handle(payload, "signature_test")).resolves.toBeUndefined();

    expect(retrieveCheckoutSession).not.toHaveBeenCalled();
    expect(grantPurchase).not.toHaveBeenCalled();
  });
});
