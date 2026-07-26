import { Inject, Injectable } from "@nestjs/common";

import { WEBHOOK_DATABASE, type ScopedDatabaseProvider } from "./scoped-database.providers";

export const STRIPE_WEBHOOK_REPOSITORY = Symbol("STRIPE_WEBHOOK_REPOSITORY");

export interface StripeCreditPurchase {
  readonly amountCents: number;
  readonly checkoutSessionId: string;
  readonly currency: string;
  readonly eventId: string;
  readonly eventType: string;
  readonly livemode: boolean;
  readonly mode: string;
  readonly paymentIntentId: string | null;
  readonly paymentStatus: string;
  readonly priceId: string;
  readonly quantity: number;
  readonly sessionStatus: string;
  readonly userId: string;
}

export interface StripeWebhookEventReference {
  readonly eventId: string;
  readonly eventType: string;
}

export interface StripeWebhookRepositoryContract {
  expireSession(
    event: StripeWebhookEventReference & { readonly checkoutSessionId: string },
  ): Promise<void>;
  grantPurchase(purchase: StripeCreditPurchase): Promise<void>;
  recordIgnored(event: StripeWebhookEventReference): Promise<void>;
}

@Injectable()
export class StripeWebhookRepository implements StripeWebhookRepositoryContract {
  public constructor(
    @Inject(WEBHOOK_DATABASE)
    private readonly databaseService: ScopedDatabaseProvider,
  ) {}

  public async grantPurchase(purchase: StripeCreditPurchase): Promise<void> {
    await this.databaseService.database.pool.query(
      `SELECT public.grant_stripe_credit_purchase(
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13
      )`,
      [
        purchase.eventId,
        purchase.eventType,
        purchase.userId,
        purchase.checkoutSessionId,
        purchase.paymentIntentId,
        purchase.priceId,
        purchase.quantity,
        purchase.amountCents,
        purchase.currency,
        purchase.livemode,
        purchase.mode,
        purchase.paymentStatus,
        purchase.sessionStatus,
      ],
    );
  }

  public async expireSession(
    event: StripeWebhookEventReference & { readonly checkoutSessionId: string },
  ): Promise<void> {
    await this.databaseService.database.pool.query(
      "SELECT public.expire_stripe_checkout_session($1, $2, $3)",
      [event.eventId, event.eventType, event.checkoutSessionId],
    );
  }

  public async recordIgnored(event: StripeWebhookEventReference): Promise<void> {
    await this.databaseService.database.pool.query(
      "SELECT public.record_stripe_webhook_ignored($1, $2)",
      [event.eventId, event.eventType],
    );
  }
}
