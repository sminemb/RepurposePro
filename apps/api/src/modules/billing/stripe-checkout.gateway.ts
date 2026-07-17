import Stripe from "stripe";

export interface StripeCheckoutRequest {
  readonly cancelUrl: string;
  readonly customerEmail: string;
  readonly packCode: string;
  readonly priceId: string;
  readonly secretKey: string;
  readonly successUrl: string;
  readonly userId: string;
}

export interface StripeCheckoutSession {
  readonly url: string | null;
}

export interface StripeCheckoutGatewayContract {
  createSession(request: StripeCheckoutRequest): Promise<StripeCheckoutSession>;
}

interface StripeCheckoutClient {
  readonly checkout: {
    readonly sessions: {
      create(input: Stripe.Checkout.SessionCreateParams): Promise<StripeCheckoutSession>;
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

    return stripe.checkout.sessions.create({
      cancel_url: request.cancelUrl,
      client_reference_id: request.userId,
      customer_email: request.customerEmail,
      line_items: [{ price: request.priceId, quantity: 1 }],
      metadata: {
        packCode: request.packCode,
        userId: request.userId,
      },
      mode: "payment",
      success_url: request.successUrl,
    });
  }
}
