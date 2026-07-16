import { beforeEach, describe, expect, it, vi } from "vitest";

const { headersMock } = vi.hoisted(() => ({ headersMock: vi.fn() }));

vi.mock("next/headers", () => ({ headers: headersMock }));
vi.mock("server-only", () => ({}));
vi.mock("@repurposepro/config", () => ({
  loadWebConfig: () => ({ apiUrl: "http://api.test/api/v1" }),
}));

import { requestApi } from "./server-api";

describe("requestApi", () => {
  beforeEach(() => {
    headersMock.mockResolvedValue(new Headers({ cookie: "session=creator-session" }));
  });

  it("forwards the session cookie and bypasses data caching", async () => {
    let capturedInit: RequestInit | undefined;
    let capturedInput: RequestInfo | URL | undefined;
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      capturedInput = _input;
      capturedInit = init;
      return Promise.resolve(new Response());
    });
    vi.stubGlobal("fetch", fetchMock);

    await requestApi("/billing/credits");

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(capturedInput).toBe("http://api.test/api/v1/billing/credits");
    expect(capturedInit?.cache).toBe("no-store");
    expect(new Headers(capturedInit?.headers).get("cookie")).toBe("session=creator-session");
  });
});
