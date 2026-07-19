import type { HttpException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import type { AuthenticatedRequest } from "../auth/auth.guard";
import { AnalysisRateLimitGuard } from "./analysis-rate-limit.guard";

const request = {
  id: "req_analysis",
  user: { email: "creator@example.test", id: "user-1", name: "Creator" },
} as AuthenticatedRequest;

const context = {
  switchToHttp: () => ({ getRequest: () => request }),
} as never;

describe("AnalysisRateLimitGuard", () => {
  it("uses the authenticated user ID as the Arcjet characteristic", async () => {
    const protect = vi.fn().mockResolvedValue({ isDenied: () => false });
    const guard = new AnalysisRateLimitGuard({ protect });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(protect).toHaveBeenCalledWith(request, {
      correlationId: "req_analysis",
      userId: "user-1",
    });
  });

  it("returns a safe 429 envelope when Arcjet denies analysis", async () => {
    const guard = new AnalysisRateLimitGuard({
      protect: vi.fn().mockResolvedValue({ isDenied: () => true }),
    });

    await expect(guard.canActivate(context)).rejects.toMatchObject({
      response: {
        error: {
          code: "RATE_LIMIT_EXCEEDED",
          details: null,
          message: "Too many processing attempts. Try again in a minute.",
          requestId: "req_analysis",
        },
      },
      status: 429,
    } satisfies Partial<HttpException>);
  });

  it("returns a safe 503 envelope when Arcjet is unavailable", async () => {
    const guard = new AnalysisRateLimitGuard({
      protect: vi.fn().mockRejectedValue(new Error("Arcjet unavailable")),
    });

    await expect(guard.canActivate(context)).rejects.toMatchObject({
      response: {
        error: {
          code: "PROCESSING_START_UNAVAILABLE",
          details: null,
          message: "Processing is temporarily unavailable. Try again.",
          requestId: "req_analysis",
        },
      },
      status: 503,
    } satisfies Partial<HttpException>);
  });
});
