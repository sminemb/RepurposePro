import { describe, expect, it } from "vitest";

import { isNavigationItemActive } from "./app-navigation";

describe("isNavigationItemActive", () => {
  it("matches Dashboard only on the dashboard route", () => {
    expect(isNavigationItemActive("/dashboard", "/dashboard")).toBe(true);
    expect(isNavigationItemActive("/dashboard/settings", "/dashboard")).toBe(false);
  });

  it("matches Billing only on the billing route", () => {
    expect(isNavigationItemActive("/billing", "/billing")).toBe(true);
    expect(isNavigationItemActive("/billing/history", "/billing")).toBe(false);
  });

  it("matches the Projects section on its root route", () => {
    expect(isNavigationItemActive("/projects", "/projects", true)).toBe(true);
  });

  it("matches the Projects section on the new-project route", () => {
    expect(isNavigationItemActive("/projects/new", "/projects", true)).toBe(true);
  });

  it("matches nested project routes", () => {
    expect(isNavigationItemActive("/projects/example", "/projects", true)).toBe(true);
  });

  it("does not match similarly prefixed routes", () => {
    expect(isNavigationItemActive("/projects-other", "/projects", true)).toBe(false);
  });
});
