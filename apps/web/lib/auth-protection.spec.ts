import { beforeEach, describe, expect, it, vi } from "vitest";
const protect = vi.hoisted(() => vi.fn());
vi.mock("@arcjet/next", () => ({
  default: () => ({ protect }),
  shield: vi.fn(),
  detectBot: vi.fn(),
  fixedWindow: vi.fn(),
}));
import { protectAuthRequest } from "./auth-protection";
beforeEach(() => protect.mockReset());
describe("auth protection", () => {
  it("preserves the body for Better Auth", async () => {
    protect.mockResolvedValue({ isDenied: () => false, isErrored: () => false });
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
});
