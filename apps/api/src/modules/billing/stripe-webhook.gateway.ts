import Stripe from "stripe";

export const STRIPE_WEBHOOK_GATEWAY = Symbol("STRIPE_WEBHOOK_GATEWAY");

export interface StripeWebhookGatewayContract {
  constructEvent(
    payload: Buffer,
    signature: string,
    secretKey: string,
    webhookSecret: string,
  ): Stripe.Event;
}

interface StripeWebhookClient {
  readonly webhooks: {
    constructEvent(payload: Buffer, signature: string, webhookSecret: string): Stripe.Event;
  };
}

type StripeClientFactory = (secretKey: string) => StripeWebhookClient;

export class StripeWebhookGateway implements StripeWebhookGatewayContract {
  public constructor(
    private readonly createClient: StripeClientFactory = (secretKey) => new Stripe(secretKey),
  ) {}

  public constructEvent(
    payload: Buffer,
    signature: string,
    secretKey: string,
    webhookSecret: string,
  ): Stripe.Event {
    return this.createClient(secretKey).webhooks.constructEvent(payload, signature, webhookSecret);
  }
}
