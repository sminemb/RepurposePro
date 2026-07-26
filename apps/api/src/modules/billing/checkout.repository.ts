import { Inject, Injectable } from "@nestjs/common";
import type { CreditPackCode } from "@repurposepro/shared";

import { CHECKOUT_DATABASE, type ScopedDatabaseProvider } from "./scoped-database.providers";

export const CHECKOUT_REPOSITORY = Symbol("CHECKOUT_REPOSITORY");

export interface CheckoutAttempt {
  readonly attemptId: string;
  readonly idempotencyKey: string;
}

export interface CheckoutRepositoryContract {
  attach(attemptId: string, sessionId: string, expiresAt: Date): Promise<void>;
  createAttempt(
    userId: string,
    packCode: CreditPackCode,
    priceId: string,
    livemode: boolean,
  ): Promise<CheckoutAttempt>;
  fail(attemptId: string): Promise<void>;
}

@Injectable()
export class CheckoutRepository implements CheckoutRepositoryContract {
  public constructor(
    @Inject(CHECKOUT_DATABASE)
    private readonly databaseService: ScopedDatabaseProvider,
  ) {}

  public async createAttempt(
    userId: string,
    packCode: CreditPackCode,
    priceId: string,
    livemode: boolean,
  ): Promise<CheckoutAttempt> {
    const result = await this.databaseService.database.pool.query<CheckoutAttempt>(
      `SELECT
        attempt_id AS "attemptId",
        idempotency_key AS "idempotencyKey"
       FROM public.create_stripe_checkout_attempt($1, $2, $3, $4)`,
      [userId, packCode, priceId, livemode],
    );
    const [attempt] = result.rows;

    if (result.rows.length !== 1 || !attempt) {
      throw new Error("Checkout attempt did not return one result.");
    }

    return attempt;
  }

  public async attach(attemptId: string, sessionId: string, expiresAt: Date): Promise<void> {
    await this.databaseService.database.pool.query(
      "SELECT public.attach_stripe_checkout_session($1, $2, $3)",
      [attemptId, sessionId, expiresAt],
    );
  }

  public async fail(attemptId: string): Promise<void> {
    await this.databaseService.database.pool.query(
      "SELECT public.fail_stripe_checkout_attempt($1)",
      [attemptId],
    );
  }
}
