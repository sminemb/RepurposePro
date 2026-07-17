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

@Module({
  controllers: [BillingController, CheckoutController],
  imports: [AuthModule, InfrastructureModule],
  providers: [
    BillingService,
    CheckoutService,
    CheckoutRateLimitGuard,
    {
      provide: CHECKOUT_RATE_LIMIT_CLIENT,
      useClass: ArcjetCheckoutRateLimitClient,
    },
    {
      provide: STRIPE_CHECKOUT_GATEWAY,
      useClass: StripeCheckoutGateway,
    },
  ],
})
export class BillingModule {}
