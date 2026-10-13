import { describe, expect, it } from "vitest";
import { isAdminEmail, loadAdminIdentityConfig, loadAdminDatabaseConfig } from "./index";

describe("admin configuration", () => {
  it("normalizes the operator email and denies absent configuration", () => {
    expect(loadAdminIdentityConfig({ ADMIN_EMAIL: "  Operator@Example.com " })).toBe(
      "operator@example.com",
    );
    expect(isAdminEmail("OPERATOR@example.com", "operator@example.com")).toBe(true);
    expect(isAdminEmail("other@example.com", "operator@example.com")).toBe(false);
    expect(isAdminEmail("", "")).toBe(false);
    expect(loadAdminIdentityConfig({})).toBe("");
    expect(loadAdminIdentityConfig({ ADMIN_EMAIL: "  " })).toBe("");
  });
  it("never falls back to a runtime or owner database connection", () => {
    expect(loadAdminDatabaseConfig({})).toBeUndefined();
    expect(() =>
      loadAdminDatabaseConfig({
        DATABASE_ADMIN_URL:
          "postgresql://repurposepro_admin:test-secret@localhost/db?user=repurposepro_owner",
      }),
    ).toThrow();
    for (const role of ["repurposepro_runtime", "repurposepro_owner"]) {
      expect(() =>
        loadAdminDatabaseConfig({
          DATABASE_ADMIN_URL: `postgresql://${role}:test-secret@localhost/db`,
        }),
      ).toThrow();
    }
    expect(
      loadAdminDatabaseConfig({
        DATABASE_ADMIN_URL: "postgresql://repurposepro_admin:test-secret@localhost/db",
      })?.connectionString,
    ).toContain("repurposepro_admin");
  });
});
