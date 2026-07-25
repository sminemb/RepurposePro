import { describe, expect, it } from "vitest";

import { getCreditStartState } from "./credit-start-state";

describe("getCreditStartState", () => {
  it("calculates the persisted balance remaining after the confirmed charge", () => {
    expect(getCreditStartState(10, 3)).toEqual({ kind: "ready", remainingBalance: 7 });
  });

  it("marks insufficient credit without offering a negative remaining balance", () => {
    expect(getCreditStartState(2, 5)).toEqual({
      creditsShort: 3,
      kind: "insufficient",
      remainingBalance: null,
    });
  });

  it("keeps an unavailable balance distinct from zero", () => {
    expect(getCreditStartState(null, 5)).toEqual({ kind: "unavailable", remainingBalance: null });
    expect(getCreditStartState(0, 5)).toMatchObject({ kind: "insufficient" });
  });
});
