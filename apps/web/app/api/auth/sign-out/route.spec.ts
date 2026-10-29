import { afterEach, describe, expect, it, vi } from "vitest";

const signOut = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth", () => ({ auth: { api: { signOut } } }));
vi.mock("@/lib/auth-maintenance", () => import("../../../../lib/auth-maintenance"));
import { POST } from "./route";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("sign-out during database cutover", () => {
  it("returns a retryable response without mutating sessions", async () => {
    vi.stubEnv("AUTH_MAINTENANCE_MODE", "true");
    const response = await POST(new Request("http://localhost:3000/api/auth/sign-out"));
    expect(response.status).toBe(503);
    expect(signOut).not.toHaveBeenCalled();
  });

  it("preserves the normal redirect and auth cookie", async () => {
    vi.stubEnv("AUTH_MAINTENANCE_MODE", "false");
    signOut.mockResolvedValue(
      new Response(null, { headers: { "set-cookie": "session=; Max-Age=0" } }),
    );
    const response = await POST(new Request("http://localhost:3000/api/auth/sign-out"));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost:3000/login");
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });
});
