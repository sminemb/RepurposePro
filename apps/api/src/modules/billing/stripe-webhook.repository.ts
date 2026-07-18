import { Injectable } from "@nestjs/common";

import { DatabaseService } from "../infrastructure/database.service";

export const STRIPE_WEBHOOK_REPOSITORY = Symbol("STRIPE_WEBHOOK_REPOSITORY");

export interface StripeCreditPurchase {
  readonly amountCents: number;
  readonly checkoutSessionId: string;
  readonly credits: number;
  readonly currency: string;
  readonly eventId: string;
  readonly eventType: string;
  readonly packCode: string;
  readonly paymentIntentId: string | null;
  readonly userId: string;
}

export interface StripeWebhookEventReference {
  readonly eventId: string;
  readonly eventType: string;
}

export interface StripeWebhookRepositoryContract {
  grantPurchase(purchase: StripeCreditPurchase): Promise<void>;
  recordIgnored(event: StripeWebhookEventReference): Promise<void>;
}

@Injectable()
export class StripeWebhookRepository implements StripeWebhookRepositoryContract {
  public constructor(private readonly databaseService: DatabaseService) {}

  public async grantPurchase(purchase: StripeCreditPurchase): Promise<void> {
    await this.databaseService.database.pool.query(
      `SELECT public.grant_stripe_credit_purchase(
        $1, $2, $3, $4, $5, $6, $7, $8, $9
      )`,
      [
        purchase.eventId,
        purchase.eventType,
        purchase.userId,
        purchase.checkoutSessionId,
        purchase.paymentIntentId,
        purchase.packCode,
        purchase.amountCents,
        purchase.currency,
        purchase.credits,
      ],
    );
  }

  public async recordIgnored(event: StripeWebhookEventReference): Promise<void> {
    await this.databaseService.database.pool.query(
      "SELECT public.record_stripe_webhook_ignored($1, $2)",
      [event.eventId, event.eventType],
    );
  }
}
