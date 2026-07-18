import { Inject, Injectable } from "@nestjs/common";
import { loadApiConfig } from "@repurposepro/config";
import { CREDIT_PACKS } from "@repurposepro/shared";
import type Stripe from "stripe";

import {
  STRIPE_WEBHOOK_GATEWAY,
  type StripeWebhookGatewayContract,
} from "./stripe-webhook.gateway";
import {
  STRIPE_WEBHOOK_REPOSITORY,
  type StripeCreditPurchase,
  type StripeWebhookEventReference,
  type StripeWebhookRepositoryContract,
} from "./stripe-webhook.repository";

export class InvalidStripeWebhookSignatureError extends Error {
  public constructor() {
    super("Stripe webhook signature is invalid.");
    this.name = "InvalidStripeWebhookSignatureError";
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

    const purchase = trustedCheckoutPurchase(event);

    if (!purchase) {
      await this.stripeWebhookRepository.recordIgnored(eventReference(event));
      return;
    }

    await this.stripeWebhookRepository.grantPurchase(purchase);
  }
}

function trustedCheckoutPurchase(event: Stripe.Event): StripeCreditPurchase | null {
  if (event.type !== "checkout.session.completed") {
    return null;
  }

  const session = event.data.object;
  const pack = CREDIT_PACKS.find((candidate) => candidate.code === session.metadata?.packCode);
  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : (session.payment_intent?.id ?? null);

  if (
    !pack ||
    session.amount_total !== pack.priceCents ||
    session.client_reference_id === null ||
    session.client_reference_id.length === 0 ||
    session.currency !== pack.currency.toLowerCase() ||
    session.id.length === 0 ||
    session.mode !== "payment" ||
    session.payment_status !== "paid" ||
    session.status !== "complete"
  ) {
    return null;
  }

  return {
    amountCents: pack.priceCents,
    checkoutSessionId: session.id,
    credits: pack.credits,
    currency: session.currency,
    eventId: event.id,
    eventType: event.type,
    packCode: pack.code,
    paymentIntentId,
    userId: session.client_reference_id,
  };
}

function eventReference(event: Stripe.Event): StripeWebhookEventReference {
  return { eventId: event.id, eventType: event.type };
}
