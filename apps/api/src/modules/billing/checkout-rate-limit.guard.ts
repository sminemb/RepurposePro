import {
  type CanActivate,
  type ExecutionContext,
  HttpException,
  Inject,
  Injectable,
  UnauthorizedException,
  Logger,
} from "@nestjs/common";
import {
  protectionFailure,
  protectionOutcome,
  type ProtectionDecision,
} from "@repurposepro/shared";
import { createProtectionClient } from "../../common/protection/arcjet-client";
import type { AuthenticatedRequest } from "../auth/auth.guard";
export const CHECKOUT_RATE_LIMIT_CLIENT = Symbol("CHECKOUT_RATE_LIMIT_CLIENT");
export type CheckoutRateLimitDecision = ProtectionDecision;
export interface CheckoutRateLimitClient {
  protect(
    request: AuthenticatedRequest,
    properties: { readonly correlationId?: string; readonly userId: string },
  ): Promise<CheckoutRateLimitDecision>;
}
@Injectable()
export class ArcjetCheckoutRateLimitClient implements CheckoutRateLimitClient {
  private readonly client = createProtectionClient("checkout");
  public protect(
    request: AuthenticatedRequest,
    properties: { readonly correlationId?: string; readonly userId: string },
  ) {
    return this.client.protect(request, properties);
  }
}
@Injectable()
export class CheckoutRateLimitGuard implements CanActivate {
  private readonly logger = new Logger(CheckoutRateLimitGuard.name);
  constructor(
    @Inject(CHECKOUT_RATE_LIMIT_CLIENT) private readonly client: CheckoutRateLimitClient,
  ) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.user)
      throw new UnauthorizedException({
        error: {
          code: "UNAUTHORIZED",
          details: null,
          message: "You need to sign in to access this resource.",
          requestId: request.id ?? "req_unknown",
        },
      });
    let decision: unknown;
    try {
      decision = await this.client.protect(request, {
        correlationId: request.id,
        userId: request.user.id,
      });
    } catch {
      decision = null;
    }
    const failure = protectionFailure(decision);
    this.logger.log({
      event: "protection_decision",
      action: "checkout",
      outcome: protectionOutcome(decision),
      requestId: request.id,
    });
    if (failure) {
      if (failure.retryAfter)
        context
          .switchToHttp()
          .getResponse?.<{ setHeader(name: string, value: string): void }>()
          ?.setHeader("Retry-After", String(failure.retryAfter));
      throw new HttpException(
        {
          error: {
            code: failure.status === 503 ? "BILLING_CHECKOUT_UNAVAILABLE" : failure.code,
            details: null,
            message:
              failure.status === 503
                ? "Checkout is temporarily unavailable. Try again."
                : failure.status === 429
                  ? "Too many checkout attempts. Try again in a minute."
                  : failure.message,
            requestId: request.id ?? "req_unknown",
          },
        },
        failure.status,
      );
    }
    return true;
  }
}
