import {
  type CanActivate,
  type ExecutionContext,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { loadApiConfig } from "@repurposepro/config";

import type { AuthenticatedRequest } from "../auth/auth.guard";

export const ANALYSIS_RATE_LIMIT_CLIENT = Symbol("ANALYSIS_RATE_LIMIT_CLIENT");

export interface AnalysisRateLimitDecision {
  isDenied(): boolean;
}

export interface AnalysisRateLimitClient {
  protect(
    request: AuthenticatedRequest,
    properties: { readonly correlationId?: string; readonly userId: string },
  ): Promise<AnalysisRateLimitDecision>;
}

@Injectable()
export class ArcjetAnalysisRateLimitClient implements AnalysisRateLimitClient {
  private client: AnalysisRateLimitClient | undefined;

  public async protect(
    request: AuthenticatedRequest,
    properties: { readonly correlationId?: string; readonly userId: string },
  ): Promise<AnalysisRateLimitDecision> {
    const config = loadApiConfig();
    if (!this.client) {
      const { default: arcjet, fixedWindow } = await import("@arcjet/node");
      this.client = arcjet({
        key: config.arcjet.key,
        rules: [
          fixedWindow({
            characteristics: ["userId"],
            max: 3,
            mode: config.arcjet.mode,
            window: "1m",
          }),
        ],
      });
    }

    return this.client.protect(request, properties);
  }
}

@Injectable()
export class AnalysisRateLimitGuard implements CanActivate {
  public constructor(
    @Inject(ANALYSIS_RATE_LIMIT_CLIENT)
    private readonly rateLimitClient: AnalysisRateLimitClient,
  ) {}

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const userId = request.user?.id;

    if (!userId) {
      throw new UnauthorizedException({
        error: {
          code: "UNAUTHORIZED",
          details: null,
          message: "You need to sign in to access this resource.",
          requestId: request.id ?? "req_unknown",
        },
      });
    }

    let decision: AnalysisRateLimitDecision;

    try {
      decision = await this.rateLimitClient.protect(request, {
        correlationId: request.id,
        userId,
      });
    } catch {
      throw new ServiceUnavailableException({
        error: {
          code: "PROCESSING_START_UNAVAILABLE",
          details: null,
          message: "Processing is temporarily unavailable. Try again.",
          requestId: request.id ?? "req_unknown",
        },
      });
    }

    if (decision.isDenied()) {
      throw new HttpException(
        {
          error: {
            code: "RATE_LIMIT_EXCEEDED",
            details: null,
            message: "Too many processing attempts. Try again in a minute.",
            requestId: request.id ?? "req_unknown",
          },
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }
}
