import { describe, expect, it } from "vitest";

import { ConfigValidationError, loadTransactionalEmailConfig } from "./index";

describe("transactional email configuration", () => {
  it("allows local work without a sender", () => {
    expect(loadTransactionalEmailConfig({ APP_ENV: "local" })).toBeNull();
  });

  it("requires delivery configuration for production and staging", () => {
    for (const appEnv of ["production", "staging"]) {
      expect(() => loadTransactionalEmailConfig({ APP_ENV: appEnv })).toThrow(
        ConfigValidationError,
      );
    }
  });

  it("rejects incomplete configuration without exposing credentials", () => {
    expect(() =>
      loadTransactionalEmailConfig({ APP_ENV: "local", RESEND_API_KEY: "private-key" }),
    ).toThrow("Invalid transactional email configuration");
    expect(() =>
      loadTransactionalEmailConfig({ APP_ENV: "local", RESEND_FROM: "invalid" }),
    ).toThrow(ConfigValidationError);
  });

  it("loads a server-only sender", () => {
    expect(
      loadTransactionalEmailConfig({
        APP_ENV: "test",
        RESEND_API_KEY: "re_test-key",
        RESEND_FROM: "RepurposePro <account@example.com>",
      }),
    ).toEqual({ apiKey: "re_test-key", from: "RepurposePro <account@example.com>" });
  });
});
