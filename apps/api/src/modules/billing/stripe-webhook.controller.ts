import { BadRequestException, Controller, Headers, HttpCode, Post, Req } from "@nestjs/common";

import { InvalidStripeWebhookSignatureError, StripeWebhookService } from "./stripe-webhook.service";

interface StripeWebhookRequest {
  readonly id?: string;
  readonly rawBody?: Buffer;
}

@Controller("billing")
export class StripeWebhookController {
  public constructor(private readonly stripeWebhookService: StripeWebhookService) {}

  @Post("webhook")
  @HttpCode(200)
  public async webhook(
    @Req() request: StripeWebhookRequest,
    @Headers("stripe-signature") signature: string | undefined,
  ): Promise<{ readonly received: true }> {
    if (!Buffer.isBuffer(request.rawBody) || !signature) {
      throw this.invalidSignature(request);
    }

    try {
      await this.stripeWebhookService.handle(request.rawBody, signature);
    } catch (error) {
      if (error instanceof InvalidStripeWebhookSignatureError) {
        throw this.invalidSignature(request);
      }

      throw error;
    }

    return { received: true };
  }

  private invalidSignature(request: StripeWebhookRequest): BadRequestException {
    return new BadRequestException({
      error: {
        code: "STRIPE_WEBHOOK_SIGNATURE_INVALID",
        details: null,
        message: "We could not verify this Stripe webhook.",
        requestId: request.id ?? "req_unknown",
      },
    });
  }
}
