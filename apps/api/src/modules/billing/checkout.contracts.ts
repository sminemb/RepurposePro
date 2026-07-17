import type { CreditPackCode } from "@repurposepro/shared";
import { z } from "zod";

const checkoutInputSchema = z
  .object({
    pack: z.enum(["starter", "creator", "pro"]),
  })
  .strict();

export interface CheckoutInput {
  readonly pack: CreditPackCode;
}

export class CheckoutContractValidationError extends Error {
  public constructor() {
    super("Invalid checkout input.");
    this.name = "CheckoutContractValidationError";
  }
}

export function parseCheckoutInput(input: unknown): CheckoutInput {
  const result = checkoutInputSchema.safeParse(input);

  if (!result.success) {
    throw new CheckoutContractValidationError();
  }

  return result.data;
}
