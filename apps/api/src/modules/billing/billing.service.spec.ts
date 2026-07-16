import { describe, expect, it, vi } from "vitest";

import type { DatabaseService } from "../infrastructure/database.service";
import {
  BillingBalanceInvalidError,
  BillingCreditsUnavailableError,
  BillingService,
  parseLedgerBalance,
} from "./billing.service";

function createDatabase(balance: unknown, failure?: Error): DatabaseService {
  const where = failure
    ? vi.fn().mockRejectedValue(failure)
    : vi.fn().mockResolvedValue([{ balance }]);
  const from = vi.fn().mockReturnValue({ where });
  const select = vi.fn().mockReturnValue({ from });

  return { database: { db: { select } } } as unknown as DatabaseService;
}

describe("parseLedgerBalance", () => {
  it.each([
    [null, 0],
    ["40", 40],
    ["0", 0],
    ["-11", -11],
    [String(Number.MAX_SAFE_INTEGER), Number.MAX_SAFE_INTEGER],
    [String(Number.MIN_SAFE_INTEGER), Number.MIN_SAFE_INTEGER],
  ])("returns exact safe integers for %j", (raw, expected) => {
    expect(parseLedgerBalance(raw)).toBe(expected);
  });

  it.each(["40.1", "40 credits", "01", "", "9007199254740992", "-9007199254740992", 40])(
    "rejects malformed or unsafe aggregate %j",
    (raw) => {
      expect(() => parseLedgerBalance(raw)).toThrow(BillingBalanceInvalidError);
    },
  );
});

describe("BillingService.getCreditBalance", () => {
  it("returns an owned ledger total without changing negative balances", async () => {
    const service = new BillingService(createDatabase("-11"));

    await expect(service.getCreditBalance("user-1")).resolves.toEqual({
      balance: -11,
      conversion: "1 credit = 1 video minute",
      unit: "credits",
    });
  });

  it("fails closed when the aggregate is invalid", async () => {
    const service = new BillingService(createDatabase("9007199254740992"));

    await expect(service.getCreditBalance("user-1")).rejects.toBeInstanceOf(
      BillingBalanceInvalidError,
    );
  });

  it("converts database failures to a safe availability error", async () => {
    const service = new BillingService(createDatabase(null, new Error("database unavailable")));

    await expect(service.getCreditBalance("user-1")).rejects.toBeInstanceOf(
      BillingCreditsUnavailableError,
    );
  });
});
