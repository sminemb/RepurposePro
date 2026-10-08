import { describe, expect, it, vi } from "vitest";

const { getHandler } = vi.hoisted(() => ({ getHandler: vi.fn() }));
vi.mock("better-auth/next-js", () => ({
  toNextJsHandler: () => ({ GET: getHandler, POST: vi.fn() }),
}));
vi.mock("@/lib/auth", () => ({ auth: {} }));
vi.mock("@/lib/auth-protection", () => ({ protectAuthRequest: vi.fn() }));
vi.mock("@repurposepro/config", () => ({
  loadWebConfig: () => ({ appUrl: "http://localhost:3000" }),
}));
import { GET } from "./route";

describe("email verification callback", () => {
  it("redirects delivery failures to safe Settings feedback without tokens", async () => {
    getHandler.mockResolvedValue(
      Response.json({ message: "private-provider-response" }, { status: 503 }),
    );
    const response = await GET(
      new Request("http://localhost:3000/api/auth/verify-email?token=private-token"),
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/dashboard/settings?error=EMAIL_DELIVERY_FAILED",
    );
    expect(await response.text()).not.toContain("private");
  });
  it("preserves native successful callbacks and unrelated responses", async () => {
    const original = new Response(null, {
      status: 302,
      headers: { location: "/dashboard/settings" },
    });
    getHandler.mockResolvedValue(original);
    expect(await GET(new Request("http://localhost:3000/api/auth/verify-email"))).toBe(original);
    const missing = new Response(null, { status: 404 });
    getHandler.mockResolvedValue(missing);
    expect(await GET(new Request("http://localhost:3000/api/auth/unknown"))).toBe(missing);
  });
});
