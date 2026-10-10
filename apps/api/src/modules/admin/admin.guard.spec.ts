import type { ExecutionContext } from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AuthService } from "../auth/auth.service";
import { AdminGuard } from "./admin.guard";

afterEach(() => vi.unstubAllEnvs());
describe("AdminGuard", () => {
  it.each([
    [null, "operator@example.com", 401],
    ["other@example.com", "operator@example.com", 403],
    ["operator@example.com", "", 403],
    ["OPERATOR@example.com", "  operator@example.com ", 200],
  ])(
    "checks the server session and sets private headers (%s)",
    async (email, configured, status) => {
      vi.stubEnv("ADMIN_EMAIL", configured);
      const request = { headers: {}, id: "req_admin", user: { email: "operator@example.com" } };
      const setHeader = vi.fn();
      const context = {
        switchToHttp: () => ({ getRequest: () => request, getResponse: () => ({ setHeader }) }),
      } as unknown as ExecutionContext;
      const guard = new AdminGuard({
        auth: {
          api: {
            getSession: async () => (email ? { user: { email, id: "u", name: "Operator" } } : null),
          },
        },
      } as unknown as AuthService);
      if (status === 200) await expect(guard.canActivate(context)).resolves.toBe(true);
      else await expect(guard.canActivate(context)).rejects.toMatchObject({ status });
      expect(setHeader).toHaveBeenCalledWith("Cache-Control", "private, no-store");
    },
  );
});
