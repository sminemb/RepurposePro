import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthService } from "../auth/auth.service";
import { DatabaseService } from "../infrastructure/database.service";
import { RedisService } from "../infrastructure/redis.service";
import { BillingModule } from "./billing.module";

describe("GET /api/v1/billing/credits", () => {
  let app: INestApplication;
  let select: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    const where = vi.fn().mockResolvedValue([{ balance: "89" }]);
    const from = vi.fn().mockReturnValue({ where });
    select = vi.fn().mockReturnValue({ from });
    const getSession = vi.fn().mockImplementation(async ({ headers }: { headers: Headers }) => {
      const cookie = headers.get("cookie");
      if (cookie === "session=user-a") {
        return { user: { email: "a@example.test", id: "user-a", name: "User A" } };
      }

      return null;
    });
    const moduleRef = await Test.createTestingModule({ imports: [BillingModule] })
      .overrideProvider(AuthService)
      .useValue({ auth: { api: { getSession } } })
      .overrideProvider(DatabaseService)
      .useValue({ database: { db: { select } } })
      .overrideProvider(RedisService)
      .useValue({})
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api/v1");
    await app.init();
    await app.listen(0, "127.0.0.1");
  }, 30_000);

  afterEach(async () => {
    await app.close();
  });

  it("rejects unauthenticated requests before querying the ledger", async () => {
    const response = await request("/api/v1/billing/credits");

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "UNAUTHORIZED",
        details: null,
        message: "You need to sign in to access this resource.",
        requestId: "req_unknown",
      },
    });
    expect(select).not.toHaveBeenCalled();
  });

  it("uses the session identity, ignores a supplied userId, and disables caching", async () => {
    const response = await request("/api/v1/billing/credits?userId=user-b", {
      headers: { cookie: "session=user-a" },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({
      data: { balance: 89, conversion: "1 credit = 1 video minute", unit: "credits" },
    });
    expect(select).toHaveBeenCalledOnce();
  });

  it("uses a safe 503 envelope when the ledger query fails", async () => {
    select.mockImplementation(() => {
      throw new Error("database unavailable");
    });

    const response = await request("/api/v1/billing/credits", {
      headers: { cookie: "session=user-a" },
    });

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "BILLING_CREDITS_UNAVAILABLE",
        details: null,
        message: "Your credit balance is temporarily unavailable. Try again.",
        requestId: "req_unknown",
      },
    });
  });

  function request(path: string, init?: RequestInit): Promise<Response> {
    const server = app.getHttpServer() as Server;
    const address = server.address() as AddressInfo;
    return fetch(`http://127.0.0.1:${address.port}${path}`, init);
  }
});
