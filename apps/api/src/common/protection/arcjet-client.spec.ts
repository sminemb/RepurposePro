import { afterEach, describe, expect, it, vi } from "vitest";
import { createServer, type ServerHttp2Session } from "node:http2";
import { createProtectionClient } from "./arcjet-client";
import { protectionFailure } from "@repurposepro/shared";
import type * as ArcjetNode from "@arcjet/node";

// Keep the SDK and transport real; its environment URL override excludes localhost.
vi.mock("@arcjet/node", async (importOriginal) => {
  const sdk = await importOriginal<typeof ArcjetNode>();
  return {
    ...sdk,
    default: (options: Parameters<typeof sdk.default>[0]) => {
      if (!options.client) throw new Error("An explicit production deadline is required.");
      return sdk.default(options);
    },
    createRemoteClient: (options: Parameters<typeof sdk.createRemoteClient>[0]) =>
      sdk.createRemoteClient({ ...options, baseUrl: process.env.ARCJET_BASE_URL }),
  };
});

afterEach(() => vi.unstubAllEnvs());

describe("protection remote deadline", () => {
  it("enforces local action limits without the remote provider", async () => {
    vi.stubEnv("LOCAL_SERVICES_ENABLED", "true");
    vi.stubEnv("APP_ENV", "local");
    vi.stubEnv("NODE_ENV", "development");
    const client = createProtectionClient("project");
    const request = {
      method: "POST",
      headers: {},
      socket: { remoteAddress: "127.0.0.1" },
    } as never;
    for (let attempt = 0; attempt < 10; attempt++) {
      expect(protectionFailure(await client.protect(request, { userId: "local-user" }))).toBeNull();
    }
    expect(
      protectionFailure(await client.protect(request, { userId: "local-user" })),
    ).toMatchObject({ status: 429 });
  });
  it.each([
    { timeout: "2000", status: 200, completed: true, errored: false },
    { timeout: "2000", status: 503, completed: true, errored: true },
    { timeout: "100", status: 200, completed: false, errored: true },
  ])("enforces the configured $timeout ms deadline with the real transport", async (expected) => {
    let completed = false;
    const sessions = new Set<ServerHttp2Session>();
    const server = createServer((_request, response) => {
      setTimeout(() => {
        completed = true;
        if (response.destroyed) return;
        response.writeHead(expected.status, { "content-type": "application/proto" });
        // Protobuf DecideResponse with an ALLOW conclusion and no cached decision TTL.
        response.end(expected.status === 200 ? Buffer.from([0x0a, 0x02, 0x10, 0x01]) : undefined);
      }, 750);
    });
    server.on("session", (session) => sessions.add(session));
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Missing fixture port.");
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("ARCJET_MODE", "LIVE");
      vi.stubEnv("ARCJET_ENV", "production");
      vi.stubEnv("ARCJET_BASE_URL", `http://127.0.0.1:${address.port}`);
      vi.stubEnv("ARCJET_TIMEOUT_MS", expected.timeout);
      const decision = await createProtectionClient("checkout").protect(
        {
          method: "POST",
          url: "/api/v1/billing/checkout",
          headers: { "user-agent": "Mozilla/5.0", host: "app.example" },
          socket: { remoteAddress: "8.8.8.8" },
        } as never,
        { userId: "test-user" },
      );
      expect(completed).toBe(expected.completed);
      expect(decision.isErrored()).toBe(expected.errored);
      if (expected.errored) expect(protectionFailure(decision)).toMatchObject({ status: 503 });
      else expect(protectionFailure(decision)).toBeNull();
    } finally {
      for (const session of sessions) session.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
