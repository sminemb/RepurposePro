import { Inject, Injectable } from "@nestjs/common";
import { loadApiConfig } from "@repurposepro/config";
import type { CreditPackCode } from "@repurposepro/shared";

import {
  type StripeCheckoutGatewayContract,
  type StripeCheckoutRequest,
} from "./stripe-checkout.gateway";

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
  ) {}

  public async create(
    user: CheckoutUser,
    packCode: CreditPackCode,
  ): Promise<CheckoutSessionResult> {
    let session: { url: string | null };

    try {
      const config = loadApiConfig();
      const request: StripeCheckoutRequest = {
        cancelUrl: config.stripe.cancelUrl,
        customerEmail: user.email,
        packCode,
        priceId: config.stripe.priceIds[packCode],
        secretKey: config.stripe.secretKey,
        successUrl: config.stripe.successUrl,
        userId: user.id,
      };

      session = await this.stripeCheckoutGateway.createSession(request);
    } catch {
      throw new CheckoutUnavailableError();
    }

    if (!isStripeCheckoutUrl(session.url)) {
      throw new CheckoutUnavailableError();
    }

    return { checkoutUrl: session.url };
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
