import { Inject, Injectable } from "@nestjs/common";
import { loadApiConfig } from "@repurposepro/config";
import type { CreditPackCode } from "@repurposepro/shared";

import {
  type StripeCheckoutGatewayContract,
  type StripeCheckoutRequest,
} from "./stripe-checkout.gateway";
import { CHECKOUT_REPOSITORY, type CheckoutRepositoryContract } from "./checkout.repository";

export const STRIPE_CHECKOUT_GATEWAY = Symbol("STRIPE_CHECKOUT_GATEWAY");

export interface CheckoutUser {
  readonly email: string;
  readonly id: string;
}

export interface CheckoutSessionResult {
  readonly checkoutUrl: string;
}

export class CheckoutUnavailableError extends Error {
  public constructor() {
    super("Checkout is unavailable.");
    this.name = "CheckoutUnavailableError";
  }
}

@Injectable()
export class CheckoutService {
  public constructor(
    @Inject(STRIPE_CHECKOUT_GATEWAY)
    private readonly stripeCheckoutGateway: StripeCheckoutGatewayContract,
    @Inject(CHECKOUT_REPOSITORY)
    private readonly checkoutRepository: CheckoutRepositoryContract,
  ) {}

  public async create(
    user: CheckoutUser,
    packCode: CreditPackCode,
  ): Promise<CheckoutSessionResult> {
    const config = loadApiConfig();
    let attempt: Awaited<ReturnType<CheckoutRepositoryContract["createAttempt"]>>;

    try {
      attempt = await this.checkoutRepository.createAttempt(
        user.id,
        packCode,
        config.stripe.priceIds[packCode],
        config.stripe.livemode,
      );
    } catch {
      throw new CheckoutUnavailableError();
    }

    let session: Awaited<ReturnType<StripeCheckoutGatewayContract["createSession"]>>;

    try {
      const request: StripeCheckoutRequest = {
        attemptId: attempt.attemptId,
        cancelUrl: config.stripe.cancelUrl,
        customerEmail: user.email,
        idempotencyKey: attempt.idempotencyKey,
        priceId: config.stripe.priceIds[packCode],
        secretKey: config.stripe.secretKey,
        successUrl: config.stripe.successUrl,
        userId: user.id,
      };

      session = await this.stripeCheckoutGateway.createSession(request);

      if (
        !isStripeCheckoutUrl(session.url) ||
        session.id.length === 0 ||
        !Number.isSafeInteger(session.expires_at) ||
        session.expires_at <= 0
      ) {
        throw new Error("Stripe returned an invalid Checkout session.");
      }
    } catch {
      await this.markAttemptFailed(attempt.attemptId);
      throw new CheckoutUnavailableError();
    }

    try {
      await this.checkoutRepository.attach(
        attempt.attemptId,
        session.id,
        new Date(session.expires_at * 1_000),
      );
    } catch {
      throw new CheckoutUnavailableError();
    }

    return { checkoutUrl: session.url };
  }

  private async markAttemptFailed(attemptId: string): Promise<void> {
    try {
      await this.checkoutRepository.fail(attemptId);
    } catch {
      // The original Checkout failure remains the actionable error.
    }
  }
}

function isStripeCheckoutUrl(value: string | null): value is string {
  if (!value) {
    return false;
  }

  try {
    const url = new URL(value);
    return url.hostname === "checkout.stripe.com" && url.protocol === "https:";
  } catch {
    return false;
  }
}
