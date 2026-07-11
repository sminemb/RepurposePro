import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import type { Request } from "express";

import { AuthService } from "./auth.service";

export interface AuthenticatedUser {
  readonly email: string;
  readonly id: string;
  readonly name: string;
}

export type AuthenticatedRequest = Request & {
  id?: string;
  user?: AuthenticatedUser;
};

@Injectable()
export class AuthGuard implements CanActivate {
  public constructor(private readonly authService: AuthService) {}

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const headers = new Headers();

    if (request.headers.cookie) {
      headers.set("cookie", request.headers.cookie);
    }

    const session = await this.authService.auth.api.getSession({ headers });

    if (!session?.user) {
      throw new UnauthorizedException({
        error: {
          code: "UNAUTHORIZED",
          details: null,
          message: "You need to sign in to access this resource.",
          requestId: request.id ?? "req_unknown",
        },
      });
    }

    request.user = {
      email: session.user.email,
      id: session.user.id,
      name: session.user.name,
    };

    return true;
  }
}
