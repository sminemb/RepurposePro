import type { CreditLedgerType } from "@repurposepro/shared";
import { z } from "zod";

const creditLedgerTypes = [
  "purchase",
  "processing_deduction",
  "refund",
  "manual_adjustment",
  "expiration_adjustment",
] as const satisfies readonly CreditLedgerType[];

const ledgerCursorSchema = z.object({
  createdAt: z.string().datetime(),
  id: z.string().min(1),
});

const ledgerListSchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  type: z.enum(creditLedgerTypes).optional(),
});

export type LedgerListInput = z.output<typeof ledgerListSchema>;

export interface LedgerCursor {
  readonly createdAt: string;
  readonly id: string;
}

export class BillingLedgerContractValidationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "BillingLedgerContractValidationError";
  }
}

export function parseLedgerListInput(input: unknown): LedgerListInput {
  const result = ledgerListSchema.safeParse(input);

  if (!result.success) {
    throw new BillingLedgerContractValidationError("Invalid credit ledger query.");
  }

  if (result.data.cursor) {
    try {
      decodeLedgerCursor(result.data.cursor);
    } catch {
      throw new BillingLedgerContractValidationError("Invalid credit ledger query.");
    }
  }

  return result.data;
}

export function encodeLedgerCursor(cursor: LedgerCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

export function decodeLedgerCursor(value: string): LedgerCursor {
  try {
    const decoded = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as unknown;
    const result = ledgerCursorSchema.safeParse(decoded);

    if (!result.success) {
      throw new BillingLedgerContractValidationError("Invalid credit ledger cursor.");
    }

    return result.data;
  } catch (error) {
    if (error instanceof BillingLedgerContractValidationError) {
      throw error;
    }

    throw new BillingLedgerContractValidationError("Invalid credit ledger cursor.");
  }
}
