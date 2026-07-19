import type { ApiSuccess, CreditBalance, CreditLedgerPage } from "@repurposepro/shared";
import {
  BadRequestException,
  Controller,
  Get,
  Header,
  InternalServerErrorException,
  Query,
  Req,
  ServiceUnavailableException,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";

import { AuthGuard, type AuthenticatedRequest } from "../auth/auth.guard";
import {
  BillingBalanceInvalidError,
  BillingCreditsUnavailableError,
  BillingLedgerUnavailableError,
  BillingService,
} from "./billing.service";
import {
  BillingLedgerContractValidationError,
  parseLedgerListInput,
  type LedgerListInput,
} from "./billing.contracts";

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

  @Get("ledger")
  @Header("Cache-Control", "private, no-store")
  public async ledger(
    @Query() query: unknown,
    @Req() request: AuthenticatedRequest,
  ): Promise<CreditLedgerPage> {
    const input = this.parseLedgerQuery(query, request);

    try {
      return await this.billingService.getCreditLedger(this.userId(request), input);
    } catch (error) {
      if (error instanceof BillingLedgerUnavailableError) {
        throw new ServiceUnavailableException({
          error: {
            code: "BILLING_LEDGER_UNAVAILABLE",
            details: null,
            message: "Your credit history is temporarily unavailable. Try again.",
            requestId: request.id ?? "req_unknown",
          },
        });
      }

      throw error;
    }
  }

  private parseLedgerQuery(query: unknown, request: AuthenticatedRequest): LedgerListInput {
    try {
      return parseLedgerListInput(query);
    } catch (error) {
      if (error instanceof BillingLedgerContractValidationError) {
        throw new BadRequestException({
          error: {
            code: "BILLING_LEDGER_QUERY_INVALID",
            details: null,
            message: error.message,
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
