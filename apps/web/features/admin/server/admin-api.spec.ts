import { afterEach, describe, expect, it, vi } from "vitest";
const { getSession, requestApi, redirect } = vi.hoisted(() => ({
  getSession: vi.fn(),
  requestApi: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw Object.assign(new Error(path), { digest: "NEXT_REDIRECT" });
  }),
}));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession } } }));
vi.mock("@/lib/server-api", () => ({ requestApi }));
import { getAdminSession, readAdmin } from "./admin-api";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
describe("admin server data boundary", () => {
  it("redirects signed-out requests without fetching admin data", async () => {
    getSession.mockResolvedValue(null);
    await expect(readAdmin("/overview")).rejects.toMatchObject({ digest: "NEXT_REDIRECT" });
    expect(redirect).toHaveBeenCalledWith("/login");
    expect(requestApi).not.toHaveBeenCalled();
  });
  it.each(["", "operator@example.test"])(
    "denies non-admins with configuration %s",
    async (email) => {
      vi.stubEnv("ADMIN_EMAIL", email);
      getSession.mockResolvedValue({ user: { email: "other@example.test" } });
      expect(await getAdminSession()).toBeNull();
      expect(await readAdmin("/users")).toMatchObject({ ok: false });
      expect(requestApi).not.toHaveBeenCalled();
    },
  );
  it("returns only safe data/errors and retains expired-session redirects", async () => {
    vi.stubEnv("ADMIN_EMAIL", " Operator@example.test ");
    getSession.mockResolvedValue({ user: { email: "OPERATOR@example.test" } });
    requestApi.mockResolvedValue(Response.json({ data: [] }));
    expect(await readAdmin("/users")).toEqual({ ok: true, value: { data: [] } });
    requestApi.mockResolvedValue(
      Response.json({ error: { message: "SECRET_DATABASE_ERROR" } }, { status: 503 }),
    );
    expect(JSON.stringify(await readAdmin("/users"))).not.toContain("SECRET");
    requestApi.mockResolvedValue(new Response(null, { status: 401 }));
    await expect(readAdmin("/users")).rejects.toMatchObject({ digest: "NEXT_REDIRECT" });
  });
});
