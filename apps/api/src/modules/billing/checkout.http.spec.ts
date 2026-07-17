import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthService } from "../auth/auth.service";
import { DatabaseService } from "../infrastructure/database.service";
import { RedisService } from "../infrastructure/redis.service";
import { BillingModule } from "./billing.module";
import { CHECKOUT_RATE_LIMIT_CLIENT } from "./checkout-rate-limit.guard";
import { CheckoutService } from "./checkout.service";

describe("POST /api/v1/billing/checkout", () => {
  let app: INestApplication;
  let createCheckout: ReturnType<typeof vi.fn>;
  let protect: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    createCheckout = vi
      .fn()
      .mockResolvedValue({ checkoutUrl: "https://checkout.stripe.com/c/pay_test" });
    protect = vi.fn().mockResolvedValue({ isDenied: () => false });
    const getSession = vi.fn().mockImplementation(async ({ headers }: { headers: Headers }) => {
      if (headers.get("cookie") === "session=user-a") {
        return { user: { email: "a@example.test", id: "user-a", name: "User A" } };
      }

      return null;
    });
    const moduleRef = await Test.createTestingModule({ imports: [BillingModule] })
      .overrideProvider(AuthService)
      .useValue({ auth: { api: { getSession } } })
      .overrideProvider(DatabaseService)
      .useValue({ database: { db: {} } })
      .overrideProvider(RedisService)
      .useValue({})
      .overrideProvider(CheckoutService)
      .useValue({ create: createCheckout })
      .overrideProvider(CHECKOUT_RATE_LIMIT_CLIENT)
      .useValue({ protect })
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api/v1");
    await app.init();
    await app.listen(0, "127.0.0.1");
  }, 30_000);

  afterEach(async () => {
    await app.close();
  });

  it("rejects unauthenticated Checkout before Arcjet or Stripe", async () => {
    const response = await request("/api/v1/billing/checkout", {
      body: JSON.stringify({ pack: "creator" }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "UNAUTHORIZED",
        details: null,
        message: "You need to sign in to access this resource.",
        requestId: "req_unknown",
      },
    });
    expect(protect).not.toHaveBeenCalled();
    expect(createCheckout).not.toHaveBeenCalled();
  });

  it("uses session identity, returns Checkout URL, and ignores no client billing fields", async () => {
    const response = await request("/api/v1/billing/checkout", {
      body: JSON.stringify({ pack: "creator" }),
      headers: { cookie: "session=user-a", "content-type": "application/json" },
      method: "POST",
    });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      data: { checkoutUrl: "https://checkout.stripe.com/c/pay_test" },
    });
    expect(protect).toHaveBeenCalledOnce();
    expect(createCheckout).toHaveBeenCalledWith(
      { email: "a@example.test", id: "user-a" },
      "creator",
    );
  });

  it("rejects client-provided price and credits before Stripe", async () => {
    const response = await request("/api/v1/billing/checkout", {
      body: JSON.stringify({ credits: 999, pack: "creator", priceId: "price_untrusted" }),
      headers: { cookie: "session=user-a", "content-type": "application/json" },
      method: "POST",
    });

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "BILLING_PACK_INVALID",
        details: null,
        message: "Choose a valid credit pack.",
        requestId: "req_unknown",
      },
    });
    expect(createCheckout).not.toHaveBeenCalled();
  });

  it("returns documented 429 envelope when Arcjet denies Checkout", async () => {
    protect.mockResolvedValue({ isDenied: () => true });
    const response = await request("/api/v1/billing/checkout", {
      body: JSON.stringify({ pack: "pro" }),
      headers: { cookie: "session=user-a", "content-type": "application/json" },
      method: "POST",
    });

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "RATE_LIMIT_EXCEEDED",
        details: null,
        message: "Too many checkout attempts. Try again in a minute.",
        requestId: "req_unknown",
      },
    });
    expect(createCheckout).not.toHaveBeenCalled();
  });

  function request(path: string, init?: RequestInit): Promise<Response> {
    const server = app.getHttpServer() as Server;
    const address = server.address() as AddressInfo;
    return fetch(`http://127.0.0.1:${address.port}${path}`, init);
  }
});
