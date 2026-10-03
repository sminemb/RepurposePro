import { describe, expect, it } from "vitest";
import { protectionFailure } from "./protection";

describe("protection decisions", () => {
  it("rejects error decisions even when they are not denied", () => {
    expect(protectionFailure({ isDenied: () => false, isErrored: () => true })).toMatchObject({
      status: 503,
    });
  });
  it("fails closed on malformed decisions", () => {
    expect(protectionFailure(null)).toMatchObject({ status: 503 });
    expect(protectionFailure({ isDenied: () => false })).toMatchObject({ status: 503 });
  });
  it("distinguishes attack blocks from rate limits", () => {
    expect(
      protectionFailure({
        isDenied: () => true,
        isErrored: () => false,
        reason: { isRateLimit: () => false },
      }),
    ).toMatchObject({ status: 403, code: "REQUEST_BLOCKED" });
    expect(
      protectionFailure(
        {
          isDenied: () => true,
          isErrored: () => false,
          reason: { isRateLimit: () => true, resetTime: 110 },
        },
        100_000,
      ),
    ).toMatchObject({ status: 429, retryAfter: 10 });
  });
  it("allows valid allowed and dry-run decisions", () => {
    expect(protectionFailure({ isDenied: () => false, isErrored: () => false })).toBeNull();
  });
  it("uses the SDK's Date reset time for the signup window", () => {
    expect(
      protectionFailure(
        {
          isDenied: () => true,
          isErrored: () => false,
          reason: { isRateLimit: () => true, resetTime: new Date(700_000) },
        },
        100_000,
      ),
    ).toMatchObject({ retryAfter: 600 });
  });
});
