import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSession, redirect } = vi.hoisted(() => ({ getSession: vi.fn(), redirect: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession } },
  transactionalEmailConfigured: false,
}));
vi.mock("next/headers", () => ({ headers: () => new Headers() }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/components/app/app-sidebar", () => ({ AppSidebar: () => null }));
vi.mock("@/components/app/app-topbar", () => ({
  AppTopbar: ({ userName }: { userName: string }) => createElement("header", null, userName),
}));
vi.mock("@/components/app/page-header", () => ({
  PageHeader: ({ title }: { title: string }) => createElement("h1", null, title),
}));
vi.mock("@/features/settings/components/settings-forms", () => ({
  SettingsForms: ({
    name,
    email,
    callbackError,
  }: {
    name: string;
    email: string;
    callbackError?: string;
  }) => createElement("div", null, name, email, callbackError),
}));
import SettingsPage from "./page";

beforeEach(() => {
  getSession.mockReset();
  redirect.mockReset();
  redirect.mockImplementation(() => {
    throw new Error("redirect");
  });
});

describe("Settings page", () => {
  it("redirects unauthenticated visitors", async () => {
    getSession.mockResolvedValue(null);
    await expect(SettingsPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("redirect");
    expect(redirect).toHaveBeenCalledWith("/login");
  });
  it("renders only the active session's account", async () => {
    getSession.mockResolvedValue({
      user: { name: "Creator One", email: "one@example.com", emailVerified: false },
    });
    const markup = renderToStaticMarkup(
      (await SettingsPage({ searchParams: Promise.resolve({}) })) as ReactNode,
    );
    expect(markup).toContain("Creator One");
    expect(markup).toContain("one@example.com");
    expect(markup).not.toContain("two@example.com");
  });
  it.each(["private-token-marker", "__proto__", "constructor"])(
    "does not display untrusted callback error %s",
    async (error) => {
      getSession.mockResolvedValue({
        user: { name: "Creator", email: "one@example.com", emailVerified: true },
      });
      const markup = renderToStaticMarkup(
        (await SettingsPage({
          searchParams: Promise.resolve({ error }),
        })) as ReactNode,
      );
      expect(markup).not.toContain("private-token-marker");
      expect(markup).toContain("could not be completed");
    },
  );
});
