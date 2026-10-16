import { describe, expect, it } from "vitest";
import { createLocalProtection } from "./local-protection";
import { protectionFailure } from "./protection";

describe("local development protection", () => {
  it("allows signup without a remote service and enforces its existing window", () => {
    let now = 0;
    const protect = createLocalProtection(() => now);
    for (let attempt = 0; attempt < 5; attempt++) {
      expect(protectionFailure(protect("signup", "anonymous"), now)).toBeNull();
    }
    expect(protectionFailure(protect("signup", "anonymous"), now)).toMatchObject({
      status: 429,
      code: "RATE_LIMIT_EXCEEDED",
      retryAfter: 600,
    });
    now = 600_000;
    expect(protectionFailure(protect("signup", "anonymous"), now)).toBeNull();
  });

  it("keeps account and action windows independent", () => {
    const protect = createLocalProtection(() => 0);
    for (let attempt = 0; attempt < 5; attempt++) protect("password", "account-1");
    expect(protectionFailure(protect("password", "account-1"), 0)?.status).toBe(429);
    expect(protectionFailure(protect("password", "account-2"), 0)).toBeNull();
    expect(protectionFailure(protect("profile", "account-1"), 0)).toBeNull();
  });

  it("bounds memory without evicting active limits and recovers after expiration", () => {
    let now = 0;
    const protect = createLocalProtection(() => now);
    for (let user = 0; user < 1_000; user++) protect("profile", String(user));
    expect(protectionFailure(protect("profile", "new-account"), now)?.status).toBe(429);
    now = 60_000;
    expect(protectionFailure(protect("profile", "new-account"), now)).toBeNull();
  });
});
