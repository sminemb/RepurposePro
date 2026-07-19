import { schema } from "@repurposepro/db";
import type { CreditBalance, CreditLedgerEntry, CreditLedgerPage } from "@repurposepro/shared";
import { Injectable } from "@nestjs/common";
import { and, desc, eq, lt, or, sql } from "drizzle-orm";

import { DatabaseService } from "../infrastructure/database.service";
import { decodeLedgerCursor, encodeLedgerCursor, type LedgerListInput } from "./billing.contracts";

const { creditLedger } = schema;
const maximumSafeBalance = BigInt(Number.MAX_SAFE_INTEGER);
const minimumSafeBalance = BigInt(Number.MIN_SAFE_INTEGER);
const integerText = /^-?(0|[1-9]\d*)$/;

export class BillingBalanceInvalidError extends Error {
  public constructor() {
    super("Credit ledger aggregate is not a safe integer.");
    this.name = "BillingBalanceInvalidError";
  }
}

export class BillingCreditsUnavailableError extends Error {
  public constructor() {
    super("Credit ledger aggregate could not be read.");
    this.name = "BillingCreditsUnavailableError";
  }
}

export class BillingLedgerUnavailableError extends Error {
  public constructor() {
    super("Credit ledger could not be read.");
    this.name = "BillingLedgerUnavailableError";
  }
}

export function parseLedgerBalance(rawBalance: unknown): number {
  if (rawBalance === null) {
    return 0;
  }

  if (typeof rawBalance !== "string" || !integerText.test(rawBalance)) {
    throw new BillingBalanceInvalidError();
  }

  const balance = BigInt(rawBalance);

  if (balance > maximumSafeBalance || balance < minimumSafeBalance) {
    throw new BillingBalanceInvalidError();
  }

  return Number(balance);
}

@Injectable()
export class BillingService {
  public constructor(private readonly databaseService: DatabaseService) {}

  public async getCreditBalance(userId: string): Promise<CreditBalance> {
    let rows: { balance: string | null }[];

    try {
      rows = await this.databaseService.database.db
        .select({ balance: sql<string | null>`COALESCE(SUM(${creditLedger.amount}), 0)::text` })
        .from(creditLedger)
        .where(eq(creditLedger.userId, userId));
    } catch {
      throw new BillingCreditsUnavailableError();
    }

    const [row] = rows;
    if (rows.length !== 1 || row?.balance === undefined) {
      throw new BillingBalanceInvalidError();
    }

    return {
      balance: parseLedgerBalance(row.balance),
      conversion: "1 credit = 1 video minute",
      unit: "credits",
    };
  }

  public async getCreditLedger(userId: string, input: LedgerListInput): Promise<CreditLedgerPage> {
    const conditions = [eq(creditLedger.userId, userId)];

    if (input.type) {
      conditions.push(eq(creditLedger.type, input.type));
    }

    if (input.cursor) {
      const cursor = decodeLedgerCursor(input.cursor);
      const cursorCreatedAt = new Date(cursor.createdAt);
      const cursorCondition = or(
        lt(creditLedger.createdAt, cursorCreatedAt),
        and(eq(creditLedger.createdAt, cursorCreatedAt), lt(creditLedger.id, cursor.id)),
      );

      if (!cursorCondition) {
        throw new BillingLedgerUnavailableError();
      }

      conditions.push(cursorCondition);
    }

    try {
      const rows = await this.databaseService.database.db
        .select({
          amount: creditLedger.amount,
          createdAt: creditLedger.createdAt,
          description: creditLedger.description,
          id: creditLedger.id,
          projectId: creditLedger.projectId,
          type: creditLedger.type,
        })
        .from(creditLedger)
        .where(and(...conditions))
        .orderBy(desc(creditLedger.createdAt), desc(creditLedger.id))
        .limit(input.limit + 1);
      const hasMore = rows.length > input.limit;
      const page = rows.slice(0, input.limit);
      const lastEntry = page.at(-1);

      return {
        data: page.map((entry): CreditLedgerEntry => ({
          amount: entry.amount,
          createdAt: entry.createdAt.toISOString(),
          description: entry.description,
          id: entry.id,
          projectId: entry.projectId,
          type: entry.type,
        })),
        meta: {
          nextCursor:
            hasMore && lastEntry
              ? encodeLedgerCursor({
                  createdAt: lastEntry.createdAt.toISOString(),
                  id: lastEntry.id,
                })
              : null,
        },
      };
    } catch {
      throw new BillingLedgerUnavailableError();
    }
  }
}
