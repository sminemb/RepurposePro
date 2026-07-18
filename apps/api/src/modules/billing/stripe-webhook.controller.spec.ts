import { BadRequestException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { StripeWebhookController } from "./stripe-webhook.controller";
import {
  InvalidStripeWebhookSignatureError,
  type StripeWebhookService,
} from "./stripe-webhook.service";

describe("StripeWebhookController.webhook", () => {
  const rawBody = Buffer.from('{"type":"checkout.session.completed"}');

  it("passes the exact raw payload and signature to the webhook service", async () => {
    const handle = vi.fn().mockResolvedValue(undefined);
    const controller = new StripeWebhookController({ handle } as unknown as StripeWebhookService);

    await expect(controller.webhook({ rawBody }, "signature_test")).resolves.toEqual({
      received: true,
    });
    expect(handle).toHaveBeenCalledWith(rawBody, "signature_test");
  });

  it.each([
    ["does not receive a raw payload", { rawBody: undefined }, "signature_test"],
    ["does not receive a Stripe signature", { rawBody }, undefined],
  ])("returns the safe 400 envelope when it %s", async (_label, request, signature) => {
    const controller = new StripeWebhookController({
      handle: vi.fn(),
    } as unknown as StripeWebhookService);

    await expect(controller.webhook(request, signature)).rejects.toEqual(
      new BadRequestException({
        error: {
          code: "STRIPE_WEBHOOK_SIGNATURE_INVALID",
          details: null,
          message: "We could not verify this Stripe webhook.",
          requestId: "req_unknown",
        },
      }),
    );
  });

  it("does not expose a Stripe signature verification failure", async () => {
    const controller = new StripeWebhookController({
      handle: vi.fn().mockRejectedValue(new InvalidStripeWebhookSignatureError()),
    } as unknown as StripeWebhookService);

    await expect(controller.webhook({ rawBody }, "bad_signature")).rejects.toEqual(
      new BadRequestException({
        error: {
          code: "STRIPE_WEBHOOK_SIGNATURE_INVALID",
          details: null,
          message: "We could not verify this Stripe webhook.",
          requestId: "req_unknown",
        },
      }),
    );
  });
});
