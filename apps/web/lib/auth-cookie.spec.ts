import { describe, expect, it } from "vitest";

import { resolveAuthCookieConfiguration } from "./auth-cookie";

describe("resolveAuthCookieConfiguration", () => {
  it("keeps host-only defaults when the app and API use the same host", () => {
    expect(
      resolveAuthCookieConfiguration("http://localhost:3000", "http://localhost:4000/api/v1"),
    ).toBeUndefined();
  });

  it("shares secure SameSite=None cookies across sibling subdomains", () => {
    expect(
      resolveAuthCookieConfiguration("https://app.example.com", "https://api.example.com/api/v1"),
    ).toEqual({
      crossSubDomainCookies: { domain: "example.com", enabled: true },
      defaultCookieAttributes: { sameSite: "none", secure: true },
    });
  });

  it("rejects hosts that cannot share a parent cookie domain", () => {
    expect(() =>
      resolveAuthCookieConfiguration("https://example.com", "https://example.net/api/v1"),
    ).toThrow("APP_URL and NEXT_PUBLIC_API_URL must share a parent domain");
  });
});
