import { describe, expect, it } from "vitest";

import {
  BillingLedgerContractValidationError,
  decodeLedgerCursor,
  encodeLedgerCursor,
  parseLedgerListInput,
} from "./billing.contracts";

describe("parseLedgerListInput", () => {
  it("uses safe page defaults and accepts every documented ledger type", () => {
    expect(parseLedgerListInput({})).toEqual({ limit: 20 });

    for (const type of [
      "purchase",
      "processing_deduction",
      "refund",
      "manual_adjustment",
      "expiration_adjustment",
    ]) {
      expect(parseLedgerListInput({ limit: "50", type })).toEqual({ limit: 50, type });
    }
  });

  it.each([
    { limit: "0" },
    { limit: "51" },
    { limit: "not-a-number" },
    { type: "unknown" },
    { cursor: "not-a-cursor" },
  ])("rejects malformed ledger list query %j", (input) => {
    expect(() => parseLedgerListInput(input)).toThrow(BillingLedgerContractValidationError);
  });
});

describe("ledger cursor", () => {
  it("round-trips an opaque timestamp and ledger ID", () => {
    const cursor = encodeLedgerCursor({
      createdAt: "2026-07-19T00:10:00.000Z",
      id: "00000000-0000-0000-0000-000000000001",
    });

    expect(decodeLedgerCursor(cursor)).toEqual({
      createdAt: "2026-07-19T00:10:00.000Z",
      id: "00000000-0000-0000-0000-000000000001",
    });
  });

  it.each(["", "not-base64", "eyJpZCI6Im1pc3NpbmctdGltZXN0YW1wIn0"])(
    "rejects an invalid cursor %j",
    (cursor) => {
      expect(() => decodeLedgerCursor(cursor)).toThrow(BillingLedgerContractValidationError);
    },
  );
});
