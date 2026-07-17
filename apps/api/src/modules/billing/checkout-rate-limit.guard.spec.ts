import { HttpException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import type { AuthenticatedRequest } from "../auth/auth.guard";
import { CheckoutRateLimitGuard } from "./checkout-rate-limit.guard";

const request = {
  id: "req_checkout",
  user: { email: "creator@example.test", id: "user-1", name: "Creator" },
} as AuthenticatedRequest;

const context = {
  switchToHttp: () => ({ getRequest: () => request }),
} as never;

describe("CheckoutRateLimitGuard", () => {
  it("uses authenticated user ID as Arcjet characteristic", async () => {
    const protect = vi.fn().mockResolvedValue({ isDenied: () => false });
    const guard = new CheckoutRateLimitGuard({ protect });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(protect).toHaveBeenCalledWith(request, {
      correlationId: "req_checkout",
      userId: "user-1",
    });
  });

  it("returns documented 429 envelope when Arcjet denies Checkout", async () => {
    const guard = new CheckoutRateLimitGuard({
      protect: vi.fn().mockResolvedValue({ isDenied: () => true }),
    });

    try {
      await guard.canActivate(context);
      expect.unreachable("Arcjet denial must stop Checkout.");
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(HttpException);
      const exception = error as HttpException;
      expect(exception.getStatus()).toBe(429);
      expect(exception.getResponse()).toEqual({
        error: {
          code: "RATE_LIMIT_EXCEEDED",
          details: null,
          message: "Too many checkout attempts. Try again in a minute.",
          requestId: "req_checkout",
        },
      });
    }
  });
});
