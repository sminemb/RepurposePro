import { Controller, Get, Req, UseGuards } from "@nestjs/common";
import type { ApiSuccess } from "@repurposepro/shared";

import { AuthGuard, type AuthenticatedRequest, type AuthenticatedUser } from "./auth.guard";

@Controller("auth")
export class AuthController {
  @Get("session")
  @UseGuards(AuthGuard)
  public session(@Req() request: AuthenticatedRequest): ApiSuccess<{ user: AuthenticatedUser }> {
    return { data: { user: request.user as AuthenticatedUser } };
  }
}
