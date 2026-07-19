import { describe, expect, it } from "vitest";

import {
  ProcessingContractValidationError,
  parseStartAnalysisInput,
} from "./processing.contracts";

describe("processing start contract validation", () => {
  it("accepts only an explicit processing-charge confirmation", () => {
    expect(parseStartAnalysisInput({ confirmed: true })).toEqual({ confirmed: true });
  });

  it.each([
    ["missing confirmation", {}],
    ["declined confirmation", { confirmed: false }],
    ["unexpected request field", { confirmed: true, projectId: "other-project" }],
  ])("rejects %s", (_label, input) => {
    expect(() => parseStartAnalysisInput(input)).toThrow(ProcessingContractValidationError);
    expect(() => parseStartAnalysisInput(input)).toThrow(
      "Confirm the credit charge before starting processing.",
    );
  });
});
