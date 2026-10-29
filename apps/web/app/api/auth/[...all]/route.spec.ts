import { afterEach, describe, expect, it, vi } from "vitest";

const { getHandler, postHandler, protect } = vi.hoisted(() => ({
  getHandler: vi.fn(),
  postHandler: vi.fn(),
  protect: vi.fn(),
}));
vi.mock("better-auth/next-js", () => ({
  toNextJsHandler: () => ({ GET: getHandler, POST: postHandler }),
}));
vi.mock("@/lib/auth", () => ({ auth: {} }));
vi.mock("@/lib/auth-protection", () => ({ protectAuthRequest: protect }));
vi.mock("@/lib/auth-maintenance", () => import("../../../../lib/auth-maintenance"));
vi.mock("@repurposepro/config", () => ({
  loadWebConfig: () => ({ appUrl: "http://localhost:3000" }),
}));
import { GET, POST } from "./route";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("database cutover maintenance", () => {
  it.each([GET, POST])("blocks auth access before protection or database work", async (handler) => {
    vi.stubEnv("AUTH_MAINTENANCE_MODE", "true");
    const response = await handler(new Request("http://localhost:3000/api/auth/get-session"));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ code: "AUTH_MAINTENANCE" });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Retry-After")).toBe("300");
    expect(getHandler).not.toHaveBeenCalled();
    expect(postHandler).not.toHaveBeenCalled();
    expect(protect).not.toHaveBeenCalled();
  });

  it("keeps POST behavior unchanged by default", async () => {
    vi.stubEnv("AUTH_MAINTENANCE_MODE", "false");
    protect.mockResolvedValue(null);
    const original = Response.json({ ok: true });
    postHandler.mockResolvedValue(original);
    expect(await POST(new Request("http://localhost:3000/api/auth/sign-in/email"))).toBe(original);
    expect(protect).toHaveBeenCalledOnce();
  });
});

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
