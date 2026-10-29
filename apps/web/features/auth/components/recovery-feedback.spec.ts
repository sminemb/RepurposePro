import { describe, expect, it } from "vitest";

import { recoveryError } from "./recovery-feedback";

describe("password recovery feedback", () => {
  it.each([500, 502, 503, 504])("explains a server outage with status %s", (status) => {
    expect(recoveryError({ status })).toBe(
      "Password recovery is temporarily unavailable. Please try again later.",
    );
  });

  it("preserves specific email and protection guidance", () => {
    expect(recoveryError({ status: 503, code: "EMAIL_DELIVERY_UNAVAILABLE" })).toBe(
      "Email delivery is unavailable. Please try again later.",
    );
    expect(recoveryError({ status: 503, code: "PROTECTION_UNAVAILABLE" })).toBe(
      "Password recovery is temporarily unavailable. Please try again shortly.",
    );
    expect(recoveryError({ status: 429 })).toBe(
      "Too many attempts. Wait 10 minutes, then try again.",
    );
  });

  it("keeps unknown client errors generic", () => {
    expect(recoveryError({ status: 400, code: "UNKNOWN" })).toBe(
      "We could not complete your request. Please try again.",
    );
  });
});
