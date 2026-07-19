import { z } from "zod";

const startAnalysisInputSchema = z
  .object({
    confirmed: z.literal(true),
  })
  .strict();

export type StartAnalysisInput = z.output<typeof startAnalysisInputSchema>;

export class ProcessingContractValidationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "ProcessingContractValidationError";
  }
}

export function parseStartAnalysisInput(input: unknown): StartAnalysisInput {
  const result = startAnalysisInputSchema.safeParse(input);

  if (!result.success) {
    throw new ProcessingContractValidationError(
      "Confirm the credit charge before starting processing.",
    );
  }

  return result.data;
}
