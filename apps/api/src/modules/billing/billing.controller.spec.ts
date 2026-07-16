import { InternalServerErrorException, ServiceUnavailableException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import type { AuthenticatedRequest } from "../auth/auth.guard";
import {
  BillingBalanceInvalidError,
  BillingCreditsUnavailableError,
  type BillingService,
} from "./billing.service";
import { BillingController } from "./billing.controller";

function request(userId = "user-1"): AuthenticatedRequest {
  return {
    id: "req_billing",
    user: { email: "creator@example.test", id: userId, name: "Creator" },
  } as AuthenticatedRequest;
}

describe("BillingController.credits", () => {
  it("uses only the authenticated session identity and returns the documented shape", async () => {
    const getCreditBalance = vi.fn().mockResolvedValue({
      balance: 89,
      conversion: "1 credit = 1 video minute",
      unit: "credits",
    });
    const controller = new BillingController({ getCreditBalance } as unknown as BillingService);

    await expect(controller.credits(request())).resolves.toEqual({
      data: { balance: 89, conversion: "1 credit = 1 video minute", unit: "credits" },
    });
    expect(getCreditBalance).toHaveBeenCalledWith("user-1");
  });

  it("returns a safe 503 envelope when balance reads fail", async () => {
    const controller = new BillingController({
      getCreditBalance: vi.fn().mockRejectedValue(new BillingCreditsUnavailableError()),
    } as unknown as BillingService);

    await expect(controller.credits(request())).rejects.toEqual(
      new ServiceUnavailableException({
        error: {
          code: "BILLING_CREDITS_UNAVAILABLE",
          details: null,
          message: "Your credit balance is temporarily unavailable. Try again.",
          requestId: "req_billing",
        },
      }),
    );
  });

  it("returns a safe 500 envelope when balance aggregate validation fails", async () => {
    const controller = new BillingController({
      getCreditBalance: vi.fn().mockRejectedValue(new BillingBalanceInvalidError()),
    } as unknown as BillingService);

    await expect(controller.credits(request())).rejects.toEqual(
      new InternalServerErrorException({
        error: {
          code: "BILLING_BALANCE_INVALID",
          details: null,
          message: "We could not verify your credit balance. Try again.",
          requestId: "req_billing",
        },
      }),
    );
  });
});
