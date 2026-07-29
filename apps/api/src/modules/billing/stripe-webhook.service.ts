import { Inject, Injectable } from "@nestjs/common";
import { loadApiConfig } from "@repurposepro/config";
import type Stripe from "stripe";

import {
  STRIPE_WEBHOOK_GATEWAY,
  type StripeWebhookGatewayContract,
} from "./stripe-webhook.gateway";
import {
  STRIPE_WEBHOOK_REPOSITORY,
  type StripeCreditPurchase,
  type StripeWebhookEventReference,
  type StripeWebhookFailureClassification,
  type StripeWebhookRepositoryContract,
} from "./stripe-webhook.repository";

export class InvalidStripeWebhookSignatureError extends Error {
  public constructor() {
    super("Stripe webhook signature is invalid.");
    this.name = "InvalidStripeWebhookSignatureError";
  }
}

export class StripeWebhookProcessingError extends Error {
  public constructor() {
    super("Stripe webhook processing failed.");
    this.name = "StripeWebhookProcessingError";
  }
}

@Injectable()
export class StripeWebhookService {
  public constructor(
    @Inject(STRIPE_WEBHOOK_GATEWAY)
    private readonly stripeWebhookGateway: StripeWebhookGatewayContract,
    @Inject(STRIPE_WEBHOOK_REPOSITORY)
    private readonly stripeWebhookRepository: StripeWebhookRepositoryContract,
  ) {}

  public async handle(payload: Buffer, signature: string): Promise<void> {
    const config = loadApiConfig();
    let event: Stripe.Event;

    try {
      event = this.stripeWebhookGateway.constructEvent(
        payload,
        signature,
        config.stripe.secretKey,
        config.stripe.webhookSecret,
      );
    } catch {
      throw new InvalidStripeWebhookSignatureError();
    }

    const reference = eventReference(event);
    const receiptStatus = await this.stripeWebhookRepository.receive(reference);
    if (receiptStatus === "processed" || receiptStatus === "ignored") {
      return;
    }

    if (event.type === "checkout.session.expired") {
      try {
        await this.stripeWebhookRepository.expireSession({
          checkoutSessionId: event.data.object.id,
          ...reference,
        });
      } catch {
        return this.failRetryable(reference, "STRIPE_CHECKOUT_EXPIRATION_FAILED");
      }
      return;
    }

    if (event.type !== "checkout.session.completed") {
      await this.stripeWebhookRepository.recordIgnored(reference);
      return;
    }

    let session: Stripe.Checkout.Session;
    try {
      session = await this.stripeWebhookGateway.retrieveCheckoutSession(
        event.data.object.id,
        config.stripe.secretKey,
      );
    } catch {
      return this.failRetryable(reference, "STRIPE_CHECKOUT_RETRIEVAL_FAILED");
    }

    const purchase = trustedCheckoutPurchase(event, session);

    if (!purchase) {
      return this.failRetryable(reference, "STRIPE_PURCHASE_CORRELATION_FAILED");
    }

    try {
      await this.stripeWebhookRepository.grantPurchase(purchase);
    } catch {
      return this.failRetryable(reference, "STRIPE_PURCHASE_PROCESSING_FAILED");
    }
  }

  private async failRetryable(
    event: StripeWebhookEventReference,
    classification: StripeWebhookFailureClassification,
  ): Promise<never> {
    try {
      await this.stripeWebhookRepository.markFailed(event, classification);
    } catch {
      // The verified receipt remains durable even if its retry classification cannot be updated.
    }

    throw new StripeWebhookProcessingError();
  }
}

function trustedCheckoutPurchase(
  event: Stripe.Event,
  session: Stripe.Checkout.Session,
): StripeCreditPurchase | null {
  if (event.type !== "checkout.session.completed") {
    return null;
  }

  const lines = session.line_items?.data;
  const line = lines?.length === 1 ? lines[0] : undefined;
  const priceId = typeof line?.price === "string" ? line.price : (line?.price?.id ?? null);
  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : (session.payment_intent?.id ?? null);

  if (
    event.data.object.id !== session.id ||
    !line ||
    line.quantity !== 1 ||
    !priceId ||
    session.amount_total === null ||
    session.amount_total <= 0 ||
    session.client_reference_id === null ||
    session.client_reference_id.length === 0 ||
    session.currency === null ||
    session.currency.length === 0 ||
    session.id.length === 0 ||
    session.mode !== "payment" ||
    session.payment_status !== "paid" ||
    session.status !== "complete" ||
    typeof session.livemode !== "boolean"
  ) {
    return null;
  }

  return {
    amountCents: session.amount_total,
    checkoutSessionId: session.id,
    currency: session.currency,
    eventId: event.id,
    eventType: event.type,
    livemode: session.livemode,
    mode: session.mode,
    paymentIntentId,
    paymentStatus: session.payment_status,
    priceId,
    quantity: line.quantity,
    sessionStatus: session.status,
    userId: session.client_reference_id,
  };
}

function eventReference(event: Stripe.Event): StripeWebhookEventReference {
  return { eventId: event.id, eventType: event.type };
}
