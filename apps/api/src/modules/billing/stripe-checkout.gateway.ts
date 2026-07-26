import Stripe from "stripe";

export interface StripeCheckoutRequest {
  readonly attemptId: string;
  readonly cancelUrl: string;
  readonly customerEmail: string;
  readonly idempotencyKey: string;
  readonly priceId: string;
  readonly secretKey: string;
  readonly successUrl: string;
  readonly userId: string;
}

export interface StripeCheckoutSession {
  readonly expires_at: number;
  readonly id: string;
  readonly url: string | null;
}

export interface StripeCheckoutGatewayContract {
  createSession(request: StripeCheckoutRequest): Promise<StripeCheckoutSession>;
}

interface StripeCheckoutClient {
  readonly checkout: {
    readonly sessions: {
      create(
        input: Stripe.Checkout.SessionCreateParams,
        options: Stripe.RequestOptions,
      ): Promise<StripeCheckoutSession>;
    };
  };
}

type StripeClientFactory = (secretKey: string) => StripeCheckoutClient;

export class StripeCheckoutGateway implements StripeCheckoutGatewayContract {
  public constructor(
    private readonly createClient: StripeClientFactory = (secretKey) => new Stripe(secretKey),
  ) {}

  public async createSession(request: StripeCheckoutRequest): Promise<StripeCheckoutSession> {
    const stripe = this.createClient(request.secretKey);

    return stripe.checkout.sessions.create(
      {
        cancel_url: request.cancelUrl,
        client_reference_id: request.userId,
        customer_email: request.customerEmail,
        line_items: [{ price: request.priceId, quantity: 1 }],
        metadata: {
          checkoutAttemptId: request.attemptId,
        },
        mode: "payment",
        payment_method_types: ["card"],
        success_url: request.successUrl,
      },
      { idempotencyKey: request.idempotencyKey },
    );
  }
}
