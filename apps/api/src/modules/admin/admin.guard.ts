import { ForbiddenException, Injectable, type ExecutionContext } from "@nestjs/common";
import { isAdminEmail, loadAdminIdentityConfig } from "@repurposepro/config";
import type { Response } from "express";

import { AuthGuard, type AuthenticatedRequest } from "../auth/auth.guard";
import { AuthService } from "../auth/auth.service";

@Injectable()
export class AdminGuard extends AuthGuard {
  public constructor(authService: AuthService) {
    super(authService);
  }

  public override async canActivate(context: ExecutionContext): Promise<boolean> {
    context.switchToHttp().getResponse<Response>().setHeader("Cache-Control", "private, no-store");
    await super.canActivate(context);
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!isAdminEmail(request.user?.email ?? "", loadAdminIdentityConfig())) {
      throw new ForbiddenException({
        error: {
          code: "ADMIN_FORBIDDEN",
          message: "You do not have access to this area.",
          details: null,
          requestId: request.id ?? "req_unknown",
        },
      });
    }
    return true;
  }
}
