import { describe, expect, it, vi } from "vitest";

import type { DatabaseService } from "../infrastructure/database.service";
import {
  BillingBalanceInvalidError,
  BillingCreditsUnavailableError,
  BillingLedgerUnavailableError,
  BillingService,
  parseLedgerBalance,
} from "./billing.service";
import { decodeLedgerCursor } from "./billing.contracts";

function createDatabase(balance: unknown, failure?: Error): DatabaseService {
  const where = failure
    ? vi.fn().mockRejectedValue(failure)
    : vi.fn().mockResolvedValue([{ balance }]);
  const from = vi.fn().mockReturnValue({ where });
  const select = vi.fn().mockReturnValue({ from });

  return { database: { db: { select } } } as unknown as DatabaseService;
}

function createDatabaseRows(rows: readonly unknown[]): DatabaseService {
  const where = vi.fn().mockResolvedValue(rows);
  const from = vi.fn().mockReturnValue({ where });
  const select = vi.fn().mockReturnValue({ from });

  return { database: { db: { select } } } as unknown as DatabaseService;
}

function createLedgerDatabase(rows: readonly unknown[], failure?: Error): DatabaseService {
  const limit = failure ? vi.fn().mockRejectedValue(failure) : vi.fn().mockResolvedValue(rows);
  const orderBy = vi.fn().mockReturnValue({ limit });
  const where = vi.fn().mockReturnValue({ orderBy });
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

  it.each([undefined, "40.1", "40 credits", "01", "", "9007199254740992", "-9007199254740992", 40])(
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

  it.each([{ rows: [] }, { rows: [{}] }])(
    "fails closed when the aggregate row is missing or malformed",
    async ({ rows }) => {
      const service = new BillingService(createDatabaseRows(rows));

      await expect(service.getCreditBalance("user-1")).rejects.toBeInstanceOf(
        BillingBalanceInvalidError,
      );
    },
  );

  it("converts database failures to a safe availability error", async () => {
    const service = new BillingService(createDatabase(null, new Error("database unavailable")));

    await expect(service.getCreditBalance("user-1")).rejects.toBeInstanceOf(
      BillingCreditsUnavailableError,
    );
  });
});

describe("BillingService.getCreditLedger", () => {
  it("returns a newest-first owned page with an opaque continuation cursor", async () => {
    const service = new BillingService(
      createLedgerDatabase([
        {
          amount: 40,
          createdAt: new Date("2026-07-19T00:10:00.000Z"),
          description: "Purchased Starter credits",
          id: "00000000-0000-0000-0000-000000000003",
          projectId: null,
          type: "purchase",
        },
        {
          amount: -11,
          createdAt: new Date("2026-07-18T00:10:00.000Z"),
          description: "Processed Creator Podcast",
          id: "00000000-0000-0000-0000-000000000002",
          projectId: "00000000-0000-0000-0000-000000000001",
          type: "processing_deduction",
        },
        {
          amount: 11,
          createdAt: new Date("2026-07-17T00:10:00.000Z"),
          description: "Refunded failed processing",
          id: "00000000-0000-0000-0000-000000000001",
          projectId: "00000000-0000-0000-0000-000000000001",
          type: "refund",
        },
      ]),
    );

    const result = await service.getCreditLedger("user-1", { limit: 2 });

    expect(result.data).toEqual([
      {
        amount: 40,
        createdAt: "2026-07-19T00:10:00.000Z",
        description: "Purchased Starter credits",
        id: "00000000-0000-0000-0000-000000000003",
        projectId: null,
        type: "purchase",
      },
      {
        amount: -11,
        createdAt: "2026-07-18T00:10:00.000Z",
        description: "Processed Creator Podcast",
        id: "00000000-0000-0000-0000-000000000002",
        projectId: "00000000-0000-0000-0000-000000000001",
        type: "processing_deduction",
      },
    ]);
    expect(result.meta.nextCursor).not.toBeNull();
    expect(decodeLedgerCursor(result.meta.nextCursor ?? "")).toEqual({
      createdAt: "2026-07-18T00:10:00.000Z",
      id: "00000000-0000-0000-0000-000000000002",
    });
  });

  it("converts ledger read failures into a safe availability error", async () => {
    const service = new BillingService(createLedgerDatabase([], new Error("database unavailable")));

    await expect(service.getCreditLedger("user-1", { limit: 20 })).rejects.toBeInstanceOf(
      BillingLedgerUnavailableError,
    );
  });
});
