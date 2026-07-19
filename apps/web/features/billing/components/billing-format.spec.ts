import { describe, expect, it } from "vitest";

import {
  availableProcessingMinutes,
  formatCreditLedgerAmount,
  formatCreditLedgerType,
  formatCreditPrice,
} from "./billing-format";

describe("billing display helpers", () => {
  it("does not advertise negative processing minutes", () => {
    expect(availableProcessingMinutes(-11)).toBe(0);
    expect(availableProcessingMinutes(40)).toBe(40);
  });

  it("formats public pack cents as USD", () => {
    expect(formatCreditPrice(2500)).toBe("$25");
  });

  it("uses clear signed credit amounts and transaction labels", () => {
    expect(formatCreditLedgerAmount(40)).toBe("+40 credits");
    expect(formatCreditLedgerAmount(-11)).toBe("-11 credits");
    expect(formatCreditLedgerType("processing_deduction")).toBe("Processing charge");
    expect(formatCreditLedgerType("expiration_adjustment")).toBe("Expiration adjustment");
  });
});
