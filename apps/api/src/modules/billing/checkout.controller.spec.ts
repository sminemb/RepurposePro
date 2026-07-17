import { ServiceUnavailableException, UnprocessableEntityException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import type { AuthenticatedRequest } from "../auth/auth.guard";
import { CheckoutController } from "./checkout.controller";
import { CheckoutUnavailableError, type CheckoutService } from "./checkout.service";

const request = {
  id: "req_checkout",
  user: { email: "creator@example.test", id: "user-1", name: "Creator" },
} as AuthenticatedRequest;

describe("CheckoutController.checkout", () => {
  it("derives user identity from session and returns documented Checkout URL", async () => {
    const create = vi
      .fn()
      .mockResolvedValue({ checkoutUrl: "https://checkout.stripe.com/c/pay_test" });
    const controller = new CheckoutController({ create } as unknown as CheckoutService);

    await expect(controller.checkout(request, { pack: "creator" })).resolves.toEqual({
      data: { checkoutUrl: "https://checkout.stripe.com/c/pay_test" },
    });
    expect(create).toHaveBeenCalledWith({ email: "creator@example.test", id: "user-1" }, "creator");
  });

  it("rejects client-supplied price details with documented 422 envelope", async () => {
    const controller = new CheckoutController({ create: vi.fn() } as unknown as CheckoutService);

    await expect(
      controller.checkout(request, { pack: "creator", priceId: "price_client_supplied" }),
    ).rejects.toEqual(
      new UnprocessableEntityException({
        error: {
          code: "BILLING_PACK_INVALID",
          details: null,
          message: "Choose a valid credit pack.",
          requestId: "req_checkout",
        },
      }),
    );
  });

  it("returns a safe 503 envelope when Checkout is unavailable", async () => {
    const controller = new CheckoutController({
      create: vi.fn().mockRejectedValue(new CheckoutUnavailableError()),
    } as unknown as CheckoutService);

    await expect(controller.checkout(request, { pack: "starter" })).rejects.toEqual(
      new ServiceUnavailableException({
        error: {
          code: "BILLING_CHECKOUT_UNAVAILABLE",
          details: null,
          message: "Checkout is temporarily unavailable. Try again.",
          requestId: "req_checkout",
        },
      }),
    );
  });
});
