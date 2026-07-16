import { describe, expect, it } from "vitest";

import { CREDIT_PACKS } from "./billing";

describe("CREDIT_PACKS", () => {
  it("publishes only stable display data for the approved packs", () => {
    expect(CREDIT_PACKS).toEqual([
      {
        code: "starter",
        credits: 40,
        currency: "USD",
        displayOrder: 1,
        isRecommended: false,
        name: "Starter",
        priceCents: 1000,
      },
      {
        code: "creator",
        credits: 100,
        currency: "USD",
        displayOrder: 2,
        isRecommended: true,
        name: "Creator",
        priceCents: 2500,
      },
      {
        code: "pro",
        credits: 200,
        currency: "USD",
        displayOrder: 3,
        isRecommended: false,
        name: "Pro",
        priceCents: 5000,
      },
    ]);
  });

  it("does not expose Stripe configuration", () => {
    expect(JSON.stringify(CREDIT_PACKS).toLowerCase()).not.toContain("stripe");
    expect(CREDIT_PACKS.every((pack) => "priceId" in pack === false)).toBe(true);
  });
});
