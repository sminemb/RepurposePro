import { describe, expect, it } from "vitest";
import { expirationState } from "./retention";
describe("expiration boundaries", () => {
  const now = Date.parse("2026-10-02T00:00:00Z");
  it.each(["", "not-a-date", "2026-10-01T23:59:59Z"])(
    "fails closed for an invalid or elapsed deadline: %s",
    (deadline) => expect(expirationState(deadline, now)).toBe("expired"),
  );
  it("compares equivalent offset timestamps at the exact deadline", () => {
    expect(expirationState("2026-10-02T08:00:00+08:00", now)).toBe("expired");
  });
  it("warns below 24 hours, becomes urgent below one hour and expires at the exact deadline", () => {
    expect(expirationState(new Date(now + 86400000).toISOString(), now)).toBe("normal");
    expect(expirationState(new Date(now + 86399999).toISOString(), now)).toBe("warning");
    expect(expirationState(new Date(now + 3600000).toISOString(), now)).toBe("warning");
    expect(expirationState(new Date(now + 3599999).toISOString(), now)).toBe("urgent");
    expect(expirationState(new Date(now).toISOString(), now)).toBe("expired");
  });
});
