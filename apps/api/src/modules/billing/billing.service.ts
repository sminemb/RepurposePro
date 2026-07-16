import { schema } from "@repurposepro/db";
import type { CreditBalance } from "@repurposepro/shared";
import { Injectable } from "@nestjs/common";
import { eq, sql } from "drizzle-orm";

import { DatabaseService } from "../infrastructure/database.service";

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
    let rawBalance: unknown;

    try {
      const [row] = await this.databaseService.database.db
        .select({ balance: sql<string>`COALESCE(SUM(${creditLedger.amount}), 0)::text` })
        .from(creditLedger)
        .where(eq(creditLedger.userId, userId));
      rawBalance = row?.balance ?? null;
    } catch {
      throw new BillingCreditsUnavailableError();
    }

    return {
      balance: parseLedgerBalance(rawBalance),
      conversion: "1 credit = 1 video minute",
      unit: "credits",
    };
  }
}
