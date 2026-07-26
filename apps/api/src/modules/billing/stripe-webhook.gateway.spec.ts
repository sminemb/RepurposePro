import { describe, expect, it, vi } from "vitest";

import { StripeWebhookGateway } from "./stripe-webhook.gateway";

describe("StripeWebhookGateway", () => {
  it("verifies raw bytes and retrieves an expanded authoritative Checkout session", async () => {
    const constructEvent = vi.fn().mockReturnValue({ id: "evt_test" });
    const retrieve = vi.fn().mockResolvedValue({ id: "cs_test" });
    const createClient = vi.fn().mockReturnValue({
      checkout: { sessions: { retrieve } },
      webhooks: { constructEvent },
    });
    const gateway = new StripeWebhookGateway(createClient);
    const payload = Buffer.from('{"id":"evt_test"}');

    expect(gateway.constructEvent(payload, "signature", "sk_test_secret", "whsec_secret")).toEqual({
      id: "evt_test",
    });
    await expect(gateway.retrieveCheckoutSession("cs_test", "sk_test_secret")).resolves.toEqual({
      id: "cs_test",
    });

    expect(constructEvent).toHaveBeenCalledWith(payload, "signature", "whsec_secret");
    expect(retrieve).toHaveBeenCalledWith("cs_test", { expand: ["line_items"] });
    expect(createClient).toHaveBeenCalledWith("sk_test_secret");
  });
});
