import { beforeEach, describe, expect, it, vi } from "vitest";
const protect = vi.hoisted(() => vi.fn());
const getSession = vi.hoisted(() => vi.fn());
const createRemoteClient = vi.hoisted(() => vi.fn(() => ({ remote: true })));
const createArcjet = vi.hoisted(() => vi.fn((options: unknown) => ({ protect, options })));
const loadProtectionConfig = vi.hoisted(() => vi.fn());
vi.mock("@repurposepro/config", () => ({ loadProtectionConfig }));
vi.mock("./auth", () => ({ auth: { api: { getSession } } }));
vi.mock("@arcjet/next", () => ({
  default: createArcjet,
  createRemoteClient,
  shield: vi.fn(),
  detectBot: vi.fn(),
  fixedWindow: vi.fn(),
}));
import { protectAuthRequest } from "./auth-protection";
beforeEach(() => {
  protect.mockReset();
  getSession.mockReset();
  getSession.mockResolvedValue({ user: { id: "account-1" } });
  createRemoteClient.mockClear();
  createArcjet.mockClear();
  vi.unstubAllEnvs();
  loadProtectionConfig.mockReturnValue({
    key: "ajkey_test",
    mode: "DRY_RUN",
    local: true,
    timeoutMs: 5_000,
  });
});
describe("auth protection", () => {
  it("allows a bounded five-second decision timeout locally", async () => {
    vi.resetModules();
    const { protectAuthRequest: protectFresh } = await import("./auth-protection");
    protect.mockResolvedValue({ isDenied: () => false, isErrored: () => false });
    expect(await protectFresh(new Request("http://localhost/api/auth/sign-up/email"))).toBeNull();
    expect(createRemoteClient).toHaveBeenCalledWith({ timeout: 5_000 });
    expect(createArcjet.mock.calls[0]?.[0]).toMatchObject({ client: { remote: true } });
  });
  it("uses the configured remote timeout in production", async () => {
    vi.resetModules();
    vi.stubEnv("VERCEL", "1");
    loadProtectionConfig.mockReturnValue({
      key: "ajkey_test",
      mode: "LIVE",
      local: false,
      timeoutMs: 3_000,
    });
    const { protectAuthRequest: protectFresh } = await import("./auth-protection");
    protect.mockResolvedValue({ isDenied: () => false, isErrored: () => false });
    expect(
      await protectFresh(
        new Request("https://app.example/api/auth/sign-up/email", {
          headers: { "x-vercel-forwarded-for": "203.0.113.1" },
        }),
      ),
    ).toBeNull();
    expect(createRemoteClient).toHaveBeenCalledWith({ timeout: 3_000 });
    expect(createArcjet.mock.calls[0]?.[0]).toHaveProperty("client");
  });
  it("preserves the body for Better Auth", async () => {
    protect.mockImplementation(async (protectedRequest: Request) => {
      await protectedRequest.text();
      return { isDenied: () => false, isErrored: () => false };
    });
    const request = new Request("http://localhost:3000/api/auth/sign-up/email", {
      method: "POST",
      body: JSON.stringify({ email: "user@example.test", password: "private-marker" }),
    });
    expect(await protectAuthRequest(request)).toBeNull();
    expect(await request.json()).toMatchObject({ password: "private-marker" });
  });
  it("returns a Better Auth-compatible unavailable response", async () => {
    protect.mockResolvedValue({ isDenied: () => false, isErrored: () => true });
    const response = await protectAuthRequest(
      new Request("http://localhost/api/auth/sign-in/email", { method: "POST" }),
    );
    expect(response?.status).toBe(503);
    expect(await response?.json()).toMatchObject({ code: "PROTECTION_UNAVAILABLE" });
  });
  it("does not interfere with session or logout endpoints", async () => {
    expect(
      await protectAuthRequest(
        new Request("http://localhost/api/auth/sign-out", { method: "POST" }),
      ),
    ).toBeNull();
    expect(protect).not.toHaveBeenCalled();
  });
  it.each(["update-user", "change-password", "change-email", "send-verification-email"])(
    "protects %s before effects",
    async (endpoint) => {
      protect.mockResolvedValue({ isDenied: () => false, isErrored: () => true });
      const response = await protectAuthRequest(
        new Request(`http://localhost/api/auth/${endpoint}`, { method: "POST" }),
      );
      expect(response?.status).toBe(503);
      expect(getSession).toHaveBeenCalled();
    },
  );
  it("rejects unauthenticated account mutations before protection", async () => {
    getSession.mockResolvedValue(null);
    const response = await protectAuthRequest(
      new Request("http://localhost/api/auth/change-email", { method: "POST" }),
    );
    expect(response?.status).toBe(401);
    expect(protect).not.toHaveBeenCalled();
  });
  it("keys account protection by user and does not expose passwords in logs", async () => {
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    protect.mockResolvedValue({ isDenied: () => false, isErrored: () => false });
    const request = new Request("http://localhost/api/auth/change-password", {
      method: "POST",
      body: JSON.stringify({ currentPassword: "password-marker" }),
    });
    try {
      expect(await protectAuthRequest(request)).toBeNull();
      expect(protect.mock.calls[0]?.[1]).toMatchObject({
        userId: "account-1",
        protectionAction: "password",
      });
      expect(JSON.stringify(log.mock.calls)).not.toContain("password-marker");
      expect(await request.json()).toMatchObject({ currentPassword: "password-marker" });
    } finally {
      log.mockRestore();
    }
  });
});
