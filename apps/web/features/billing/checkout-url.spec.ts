import { describe, expect, it } from "vitest";

import { isStripeCheckoutUrl } from "./checkout-url";

describe("isStripeCheckoutUrl", () => {
  it.each(["https://checkout.stripe.com/c/pay_test", "https://checkout.stripe.com/pay/cs_test"])(
    "accepts Stripe-hosted Checkout URL: %s",
    (url) => {
      expect(isStripeCheckoutUrl(url)).toBe(true);
    },
  );

  it.each(["http://checkout.stripe.com/c/pay_test", "https://example.test/checkout", "not-a-url"])(
    "rejects unsafe browser redirect URL: %s",
    (url) => {
      expect(isStripeCheckoutUrl(url)).toBe(false);
    },
  );
});
