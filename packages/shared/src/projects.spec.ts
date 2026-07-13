import { describe, expect, it } from "vitest";

import { calculateRequiredCredits } from "./projects";

describe("calculateRequiredCredits", () => {
  it.each([
    [60, 1],
    [60.001, 2],
    [1, 1],
    [600, 10],
  ])("rounds %d seconds up to %d credits", (durationSeconds, requiredCredits) => {
    expect(calculateRequiredCredits(durationSeconds)).toBe(requiredCredits);
  });
});
