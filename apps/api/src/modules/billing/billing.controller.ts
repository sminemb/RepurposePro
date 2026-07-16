import type { ApiSuccess, CreditBalance } from "@repurposepro/shared";
import {
  Controller,
  Get,
  Header,
  InternalServerErrorException,
  Req,
  ServiceUnavailableException,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";

import { AuthGuard, type AuthenticatedRequest } from "../auth/auth.guard";
import {
  BillingBalanceInvalidError,
  BillingCreditsUnavailableError,
  BillingService,
} from "./billing.service";

@Controller("billing")
@UseGuards(AuthGuard)
export class BillingController {
  public constructor(private readonly billingService: BillingService) {}

  @Get("credits")
  @Header("Cache-Control", "private, no-store")
  public async credits(@Req() request: AuthenticatedRequest): Promise<ApiSuccess<CreditBalance>> {
    try {
      return { data: await this.billingService.getCreditBalance(this.userId(request)) };
    } catch (error) {
      if (error instanceof BillingCreditsUnavailableError) {
        throw new ServiceUnavailableException({
          error: {
            code: "BILLING_CREDITS_UNAVAILABLE",
            details: null,
            message: "Your credit balance is temporarily unavailable. Try again.",
            requestId: request.id ?? "req_unknown",
          },
        });
      }

      if (error instanceof BillingBalanceInvalidError) {
        throw new InternalServerErrorException({
          error: {
            code: "BILLING_BALANCE_INVALID",
            details: null,
            message: "We could not verify your credit balance. Try again.",
            requestId: request.id ?? "req_unknown",
          },
        });
      }

      throw error;
    }
  }

  private userId(request: AuthenticatedRequest): string {
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

    return request.user.id;
  }
}
