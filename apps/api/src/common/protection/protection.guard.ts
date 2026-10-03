import {
  type CanActivate,
  type ExecutionContext,
  HttpException,
  Injectable,
  Logger,
  SetMetadata,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { protectionFailure, type ProtectionAction } from "@repurposepro/shared";
import { AuthGuard, type AuthenticatedRequest } from "../../modules/auth/auth.guard";
import { createProtectionClient } from "./arcjet-client";

export const ProtectAction = (action: ProtectionAction) => SetMetadata("protectionAction", action);
@Injectable()
export class ProtectionGuard implements CanActivate {
  private readonly logger = new Logger(ProtectionGuard.name);
  private readonly clients = new Map<ProtectionAction, ReturnType<typeof createProtectionClient>>();
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthGuard,
  ) {}
  async canActivate(context: ExecutionContext) {
    const action = this.reflector.get<ProtectionAction>("protectionAction", context.getHandler());
    if (!action) return true;
    await this.auth.canActivate(context);
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    let decision: unknown;
    try {
      let client = this.clients.get(action);
      if (!client) {
        client = createProtectionClient(action);
        this.clients.set(action, client);
      }
      decision = await client.protect(request, { userId: request.user!.id });
    } catch {
      decision = null;
    }
    const failure = protectionFailure(decision);
    this.logger.log({
      event: "protection_decision",
      action,
      outcome: failure?.code ?? "allowed",
      requestId: request.id,
    });
    if (failure) {
      if (failure.retryAfter)
        context
          .switchToHttp()
          .getResponse<{ setHeader(name: string, value: string): void }>()
          .setHeader("Retry-After", String(failure.retryAfter));
      throw new HttpException(
        {
          error: {
            code: failure.code,
            details: null,
            message: failure.message,
            requestId: request.id ?? "req_unknown",
          },
        },
        failure.status,
      );
    }
    return true;
  }
}
