import { describe, expect, it } from "vitest";

import { availableProcessingMinutes, formatCreditPrice } from "./billing-format";

describe("billing display helpers", () => {
  it("does not advertise negative processing minutes", () => {
    expect(availableProcessingMinutes(-11)).toBe(0);
    expect(availableProcessingMinutes(40)).toBe(40);
  });

  it("formats public pack cents as USD", () => {
    expect(formatCreditPrice(2500)).toBe("$25");
  });
});
