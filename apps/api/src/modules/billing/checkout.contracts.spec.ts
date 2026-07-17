import { describe, expect, it } from "vitest";

import { CheckoutContractValidationError, parseCheckoutInput } from "./checkout.contracts";

describe("parseCheckoutInput", () => {
  it("accepts one approved pack code", () => {
    expect(parseCheckoutInput({ pack: "creator" })).toEqual({ pack: "creator" });
  });

  it.each([
    {},
    { pack: "enterprise" },
    { credits: 10, pack: "creator" },
    { pack: "creator", priceId: "price_client_supplied" },
    { pack: "creator", userId: "another-user" },
  ])("rejects untrusted checkout input: %o", (input) => {
    expect(() => parseCheckoutInput(input)).toThrow(CheckoutContractValidationError);
  });
});
