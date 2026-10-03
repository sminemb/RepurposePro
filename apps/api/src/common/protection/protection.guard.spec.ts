import { describe, expect, it, vi } from "vitest";
import { ProtectionGuard } from "./protection.guard";
import { protectionRequest } from "./arcjet-client";
const protect = vi.hoisted(() => vi.fn());
vi.mock("./arcjet-client", async (original) => ({
  ...(await original<object>()),
  createProtectionClient: () => ({ protect }),
}));

describe("protected mutations", () => {
  function setup(action: string | undefined = "upload") {
    const auth = { canActivate: vi.fn().mockResolvedValue(true) };
    const request = { user: { id: "owner" }, id: "req_test" };
    const response = { setHeader: vi.fn() };
    const context = {
      getHandler: () => {},
      switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }),
    };
    const guard = new ProtectionGuard({ get: () => action } as never, auth as never);
    return { guard, auth, response, context: context as never };
  }
  it("rejects an SDK error without permitting the handler", async () => {
    protect.mockResolvedValue({ isDenied: () => false, isErrored: () => true });
    const { guard, context } = setup();
    await expect(guard.canActivate(context)).rejects.toMatchObject({ status: 503 });
  });
  it("sets Retry-After and rejects rate limits", async () => {
    protect.mockResolvedValue({
      isDenied: () => true,
      isErrored: () => false,
      reason: { isRateLimit: () => true },
    });
    const { guard, context, response } = setup();
    await expect(guard.canActivate(context)).rejects.toMatchObject({ status: 429 });
    expect(response.setHeader).toHaveBeenCalledWith("Retry-After", "60");
  });
  it("leaves reads and webhooks outside interactive protection", async () => {
    const { guard, context, auth } = setup(undefined);
    // Explicitly use metadata-free reflector (setup's default is upload).
    const unprotected = new ProtectionGuard({ get: () => undefined } as never, auth as never);
    await expect(unprotected.canActivate(context)).resolves.toBe(true);
    expect(auth.canActivate).not.toHaveBeenCalled();
    void guard;
  });
  it("does not trust client IP headers from an unconfigured peer", () => {
    const request = {
      headers: { "x-forwarded-for": "1.2.3.4", "x-real-ip": "1.2.3.4", "user-agent": "browser" },
      socket: { remoteAddress: "10.1.1.1" },
      method: "POST",
      url: "/upload",
    };
    expect(protectionRequest(request as never, []).headers).toEqual({ "user-agent": "browser" });
    expect(protectionRequest(request as never, ["10.1.0.0/16"]).headers["x-forwarded-for"]).toBe(
      "1.2.3.4",
    );
  });
});
