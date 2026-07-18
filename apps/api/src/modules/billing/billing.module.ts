import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { InfrastructureModule } from "../infrastructure/infrastructure.module";
import { BillingController } from "./billing.controller";
import { BillingService } from "./billing.service";
import { CheckoutController } from "./checkout.controller";
import {
  ArcjetCheckoutRateLimitClient,
  CHECKOUT_RATE_LIMIT_CLIENT,
  CheckoutRateLimitGuard,
} from "./checkout-rate-limit.guard";
import { CheckoutService, STRIPE_CHECKOUT_GATEWAY } from "./checkout.service";
import { StripeCheckoutGateway } from "./stripe-checkout.gateway";
import { StripeWebhookController } from "./stripe-webhook.controller";
import { STRIPE_WEBHOOK_GATEWAY, StripeWebhookGateway } from "./stripe-webhook.gateway";
import { STRIPE_WEBHOOK_REPOSITORY, StripeWebhookRepository } from "./stripe-webhook.repository";
import { StripeWebhookService } from "./stripe-webhook.service";

@Module({
  controllers: [BillingController, CheckoutController, StripeWebhookController],
  imports: [AuthModule, InfrastructureModule],
  providers: [
    BillingService,
    CheckoutService,
    StripeWebhookService,
    StripeWebhookRepository,
    CheckoutRateLimitGuard,
    {
      provide: CHECKOUT_RATE_LIMIT_CLIENT,
      useClass: ArcjetCheckoutRateLimitClient,
    },
    {
      provide: STRIPE_CHECKOUT_GATEWAY,
      useClass: StripeCheckoutGateway,
    },
    {
      provide: STRIPE_WEBHOOK_GATEWAY,
      useClass: StripeWebhookGateway,
    },
    {
      provide: STRIPE_WEBHOOK_REPOSITORY,
      useExisting: StripeWebhookRepository,
    },
  ],
})
export class BillingModule {}
