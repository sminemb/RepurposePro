import { UnauthorizedException, type ExecutionContext } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { AuthGuard } from "./auth.guard";
import type { AuthService } from "./auth.service";

function createContext(request: { headers: { cookie?: string }; id: string }) {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe("AuthGuard", () => {
  it("rejects a request without a valid session", async () => {
    const getSession = vi.fn().mockResolvedValue(null);
    const guard = new AuthGuard({ auth: { api: { getSession } } } as unknown as AuthService);

    try {
      await guard.canActivate(createContext({ headers: {}, id: "req_unauthenticated" }));
      throw new Error("Expected unauthenticated request to be rejected.");
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(UnauthorizedException);
      expect((error as UnauthorizedException).getResponse()).toEqual({
        error: {
          code: "UNAUTHORIZED",
          details: null,
          message: "You need to sign in to access this resource.",
          requestId: "req_unauthenticated",
        },
      });
    }
    expect(getSession).toHaveBeenCalledOnce();
  });

  it("adds the Better Auth user to an authenticated request", async () => {
    const request = {
      headers: { cookie: "better-auth.session_token=token" },
      id: "req_authenticated",
    };
    const getSession = vi.fn().mockResolvedValue({
      user: { email: "creator@example.com", id: "usr_123", name: "Creator" },
    });
    const guard = new AuthGuard({ auth: { api: { getSession } } } as unknown as AuthService);

    await expect(guard.canActivate(createContext(request))).resolves.toBe(true);
    expect(request).toMatchObject({
      user: { email: "creator@example.com", id: "usr_123", name: "Creator" },
    });
  });
});
