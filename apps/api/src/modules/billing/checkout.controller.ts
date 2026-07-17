import type { ApiSuccess } from "@repurposepro/shared";
import {
  Body,
  Controller,
  HttpCode,
  Post,
  Req,
  ServiceUnavailableException,
  UnauthorizedException,
  UnprocessableEntityException,
  UseGuards,
} from "@nestjs/common";

import { AuthGuard, type AuthenticatedRequest } from "../auth/auth.guard";
import { CheckoutContractValidationError, parseCheckoutInput } from "./checkout.contracts";
import { CheckoutRateLimitGuard } from "./checkout-rate-limit.guard";
import {
  CheckoutService,
  CheckoutUnavailableError,
  type CheckoutSessionResult,
  type CheckoutUser,
} from "./checkout.service";

@Controller("billing")
@UseGuards(AuthGuard)
export class CheckoutController {
  public constructor(private readonly checkoutService: CheckoutService) {}

  @Post("checkout")
  @HttpCode(201)
  @UseGuards(CheckoutRateLimitGuard)
  public async checkout(
    @Req() request: AuthenticatedRequest,
    @Body() body: unknown,
  ): Promise<ApiSuccess<CheckoutSessionResult>> {
    try {
      const input = parseCheckoutInput(body);
      return { data: await this.checkoutService.create(this.user(request), input.pack) };
    } catch (error) {
      if (error instanceof CheckoutContractValidationError) {
        throw new UnprocessableEntityException({
          error: {
            code: "BILLING_PACK_INVALID",
            details: null,
            message: "Choose a valid credit pack.",
            requestId: request.id ?? "req_unknown",
          },
        });
      }

      if (error instanceof CheckoutUnavailableError) {
        throw new ServiceUnavailableException({
          error: {
            code: "BILLING_CHECKOUT_UNAVAILABLE",
            details: null,
            message: "Checkout is temporarily unavailable. Try again.",
            requestId: request.id ?? "req_unknown",
          },
        });
      }

      throw error;
    }
  }

  private user(request: AuthenticatedRequest): CheckoutUser {
    if (!request.user) {
      throw new UnauthorizedException({
        error: {
          code: "UNAUTHORIZED",
          details: null,
          message: "You need to sign in to access this resource.",
          requestId: request.id ?? "req_unknown",
        },
      });
    }

    return { email: request.user.email, id: request.user.id };
  }
}
