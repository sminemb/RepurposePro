import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const { pathname } = vi.hoisted(() => ({ pathname: { value: "/dashboard/settings" } }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname.value }));
vi.mock("@/components/app/brand-mark", () => ({ BrandMark: () => null }));
vi.mock("@/lib/utils", async () => import("../../lib/utils"));
vi.mock("next/link", () => ({
  default: ({ children, ...props }: { children: ReactNode; href: string }) =>
    createElement("a", props, children),
}));
import { AppSidebar } from "./app-sidebar";
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

describe("Settings navigation", () => {
  it("links Settings and marks it active without activating Dashboard", () => {
    pathname.value = "/dashboard/settings";
    const markup = renderToStaticMarkup(createElement(AppSidebar));
    expect(markup).toMatch(/aria-current="page"[^>]*href="\/dashboard\/settings"/);
    expect(markup).not.toMatch(/aria-current="page"[^>]*href="\/dashboard"/);
    expect(markup).not.toContain('aria-disabled="true"');
  });
  it("does not activate Settings on another route", () => {
    pathname.value = "/dashboard";
    const markup = renderToStaticMarkup(createElement(AppSidebar));
    expect(markup).not.toMatch(/aria-current="page"[^>]*href="\/dashboard\/settings"/);
  });
});
