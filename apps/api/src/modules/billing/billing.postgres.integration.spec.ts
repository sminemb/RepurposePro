import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { resolve } from "node:path";

import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { loadApiConfig } from "@repurposepro/config";
import { closeDatabaseClient, createDatabaseClient, type DatabaseClient } from "@repurposepro/db";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { AuthService } from "../auth/auth.service";
import { DatabaseService } from "../infrastructure/database.service";
import { RedisService } from "../infrastructure/redis.service";
import { BillingModule } from "./billing.module";
import { CHECKOUT_DATABASE, WEBHOOK_DATABASE } from "./scoped-database.providers";
import { STRIPE_WEBHOOK_GATEWAY, StripeWebhookGateway } from "./stripe-webhook.gateway";

const bootstrapUrl = process.env.TEST_DATABASE_BOOTSTRAP_URL;
const migrationUrl = process.env.TEST_DATABASE_MIGRATION_URL;
const runtimeUrl = process.env.TEST_DATABASE_RUNTIME_URL;
const describeIntegration = bootstrapUrl && migrationUrl && runtimeUrl ? describe : describe.skip;
const skippedDatabaseUrl = "postgresql://localhost/postgres";

function withDatabase(url: string | undefined, database: string): string {
  const target = new URL(url ?? skippedDatabaseUrl);
  target.pathname = `/${database}`;
  target.search = "";
  return target.toString();
}

function createClient(connectionString: string): DatabaseClient {
  return createDatabaseClient({
    connectionString,
    poolMax: 2,
    ssl: false,
  });
}

function withRole(url: string | undefined, role: string): string {
  const target = new URL(url ?? skippedDatabaseUrl);
  target.username = role;
  return target.toString();
}

describeIntegration("billing credits production query", () => {
  const database = `repurposepro_billing_api_${randomUUID().replaceAll("-", "")}`;
  const adminClient = createClient(bootstrapUrl ?? skippedDatabaseUrl);
  const migrationClient = createClient(withDatabase(migrationUrl, database));
  const runtimeClient = createClient(withDatabase(runtimeUrl, database));
  const checkoutClient = createClient(
    withDatabase(withRole(runtimeUrl, "repurposepro_checkout"), database),
  );
  const webhookClient = createClient(
    withDatabase(withRole(runtimeUrl, "repurposepro_webhook"), database),
  );
  const retrieveCheckoutSession = vi.fn();
  let app: INestApplication;

  beforeAll(async () => {
    const runtimePassword = decodeURIComponent(new URL(runtimeUrl ?? skippedDatabaseUrl).password);
    await adminClient.pool.query(
      `DO $$
       BEGIN
         IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'repurposepro_checkout') THEN
           CREATE ROLE repurposepro_checkout LOGIN;
         END IF;
         IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'repurposepro_webhook') THEN
           CREATE ROLE repurposepro_webhook LOGIN;
         END IF;
         IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'repurposepro_processing') THEN
           CREATE ROLE repurposepro_processing LOGIN;
         END IF;
       END;
       $$`,
    );
    for (const role of [
      "repurposepro_checkout",
      "repurposepro_webhook",
      "repurposepro_processing",
    ]) {
      const statement = await adminClient.pool.query<{ sql: string }>(
        "SELECT format('ALTER ROLE %I PASSWORD %L', $1::text, $2::text) AS sql",
        [role, runtimePassword],
      );
      await adminClient.pool.query(statement.rows[0]!.sql);
    }
    await adminClient.pool.query(`CREATE DATABASE ${database} OWNER repurposepro_owner`);
    await migrate(migrationClient.db, {
      migrationsFolder: resolve(process.cwd(), "packages/db/drizzle"),
    });
    await migrationClient.pool.query(
      `INSERT INTO users (id, name, email)
       VALUES ($1, $2, $3), ($4, $5, $6), ($7, $8, $9)`,
      [
        "billing-api-user-a",
        "Billing API User A",
        "billing-api-a@example.test",
        "billing-api-user-b",
        "Billing API User B",
        "billing-api-b@example.test",
        "billing-api-user-empty",
        "Billing API Empty User",
        "billing-api-empty@example.test",
      ],
    );
    await migrationClient.pool.query(
      `INSERT INTO credit_ledger
         (id, user_id, type, amount, description, idempotency_key, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7), ($8, $2, $3, $9, $10, $11, $12),
              ($13, $14, $3, $15, $16, $17, $18)`,
      [
        "00000000-0000-0000-0000-000000000301",
        "billing-api-user-a",
        "manual_adjustment",
        40,
        "User A credit",
        "billing-api-user-a-credit",
        "2026-07-18T00:10:00.000Z",
        "00000000-0000-0000-0000-000000000302",
        -11,
        "User A debit",
        "billing-api-user-a-debit",
        "2026-07-19T00:10:00.000Z",
        "00000000-0000-0000-0000-000000000303",
        "billing-api-user-b",
        999,
        "User B credit",
        "billing-api-user-b-credit",
        "2026-07-19T00:10:00.000Z",
      ],
    );

    const getSession = async ({ headers }: { headers: Headers }) => {
      const userId = {
        "session=user-a": "billing-api-user-a",
        "session=user-b": "billing-api-user-b",
        "session=user-empty": "billing-api-user-empty",
      }[headers.get("cookie") ?? ""];

      return userId
        ? {
            user: {
              email: `${userId}@example.test`,
              id: userId,
              name: userId,
            },
          }
        : null;
    };
    const moduleRef = await Test.createTestingModule({ imports: [BillingModule] })
      .overrideProvider(AuthService)
      .useValue({ auth: { api: { getSession } } })
      .overrideProvider(DatabaseService)
      .useValue({ database: runtimeClient })
      .overrideProvider(CHECKOUT_DATABASE)
      .useValue({ database: checkoutClient })
      .overrideProvider(WEBHOOK_DATABASE)
      .useValue({ database: webhookClient })
      .overrideProvider(STRIPE_WEBHOOK_GATEWAY)
      .useValue({
        constructEvent: new StripeWebhookGateway().constructEvent.bind(new StripeWebhookGateway()),
        retrieveCheckoutSession,
      })
      .overrideProvider(RedisService)
      .useValue({})
      .compile();

    app = moduleRef.createNestApplication({ rawBody: true });
    app.setGlobalPrefix("api/v1");
    await app.init();
    await app.listen(0, "127.0.0.1");
  }, 30_000);

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    await closeDatabaseClient(runtimeClient);
    await closeDatabaseClient(checkoutClient);
    await closeDatabaseClient(webhookClient);
    await closeDatabaseClient(migrationClient);
    await adminClient.pool.query(`DROP DATABASE IF EXISTS ${database} WITH (FORCE)`);
    await closeDatabaseClient(adminClient);
  });

  it("uses only the authenticated session user in the real ledger aggregate", async () => {
    const response = await request("/api/v1/billing/credits?userId=billing-api-user-b", {
      headers: { cookie: "session=user-a" },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({
      data: {
        balance: 29,
        conversion: "1 credit = 1 video minute",
        unit: "credits",
      },
    });
  });

  it("keeps other-user and empty-ledger balances isolated", async () => {
    const otherUser = await request("/api/v1/billing/credits", {
      headers: { cookie: "session=user-b" },
    });
    const emptyUser = await request("/api/v1/billing/credits", {
      headers: { cookie: "session=user-empty" },
    });

    await expect(otherUser.json()).resolves.toEqual({
      data: {
        balance: 999,
        conversion: "1 credit = 1 video minute",
        unit: "credits",
      },
    });
    await expect(emptyUser.json()).resolves.toEqual({
      data: {
        balance: 0,
        conversion: "1 credit = 1 video minute",
        unit: "credits",
      },
    });
  });

  it("returns complete owner-scoped ledger pages and applies type filters", async () => {
    const firstPage = await request("/api/v1/billing/ledger?limit=1", {
      headers: { cookie: "session=user-a" },
    });

    expect(firstPage.status).toBe(200);
    expect(firstPage.headers.get("cache-control")).toBe("private, no-store");
    const firstBody = (await firstPage.json()) as {
      data: { amount: number; id: string }[];
      meta: { nextCursor: string | null };
    };
    expect(firstBody.data).toEqual([
      expect.objectContaining({
        amount: -11,
        id: "00000000-0000-0000-0000-000000000302",
      }),
    ]);
    expect(firstBody.meta.nextCursor).toEqual(expect.any(String));

    const secondPage = await request(
      `/api/v1/billing/ledger?limit=1&cursor=${encodeURIComponent(firstBody.meta.nextCursor ?? "")}`,
      { headers: { cookie: "session=user-a" } },
    );
    const secondBody = (await secondPage.json()) as {
      data: { amount: number; id: string }[];
      meta: { nextCursor: string | null };
    };
    expect(secondBody).toEqual({
      data: [
        expect.objectContaining({
          amount: 40,
          id: "00000000-0000-0000-0000-000000000301",
        }),
      ],
      meta: { nextCursor: null },
    });

    const filtered = await request("/api/v1/billing/ledger?type=manual_adjustment", {
      headers: { cookie: "session=user-a" },
    });
    await expect(filtered.json()).resolves.toMatchObject({
      data: [
        expect.objectContaining({ id: "00000000-0000-0000-0000-000000000302" }),
        expect.objectContaining({ id: "00000000-0000-0000-0000-000000000301" }),
      ],
      meta: { nextCursor: null },
    });
  });

  it("verifies a real raw Stripe signature and grants only the persisted Checkout attempt", async () => {
    const config = loadApiConfig();
    const attempt = await checkoutClient.pool.query<{ attemptId: string }>(
      `SELECT attempt_id AS "attemptId"
       FROM public.create_stripe_checkout_attempt($1, $2, $3, $4)`,
      ["billing-api-user-a", "creator", config.stripe.priceIds.creator, config.stripe.livemode],
    );
    const checkoutSessionId = `cs_test_${randomUUID().replaceAll("-", "")}`;
    await checkoutClient.pool.query("SELECT public.attach_stripe_checkout_session($1, $2, $3)", [
      attempt.rows[0]!.attemptId,
      checkoutSessionId,
      new Date(Date.now() + 30 * 60_000),
    ]);
    retrieveCheckoutSession.mockResolvedValue({
      amount_total: 2500,
      client_reference_id: "billing-api-user-a",
      currency: "usd",
      id: checkoutSessionId,
      line_items: {
        data: [{ price: { id: config.stripe.priceIds.creator }, quantity: 1 }],
      },
      livemode: config.stripe.livemode,
      mode: "payment",
      payment_intent: `pi_test_${randomUUID().replaceAll("-", "")}`,
      payment_status: "paid",
      status: "complete",
    });

    const eventId = `evt_test_${randomUUID().replaceAll("-", "")}`;
    const payload = JSON.stringify({
      api_version: "2026-04-29.preview",
      created: Math.floor(Date.now() / 1_000),
      data: { object: { id: checkoutSessionId, object: "checkout.session" } },
      id: eventId,
      livemode: config.stripe.livemode,
      object: "event",
      pending_webhooks: 1,
      request: null,
      type: "checkout.session.completed",
    });
    const stripe = new (await import("stripe")).default(config.stripe.secretKey);
    const signedHeader = stripe.webhooks.generateTestHeaderString({
      payload,
      secret: config.stripe.webhookSecret,
    });
    const response = await request("/api/v1/billing/webhook", {
      body: payload,
      headers: {
        "content-type": "application/json",
        "stripe-signature": signedHeader,
      },
      method: "POST",
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ received: true });
    await expect(
      migrationClient.pool.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count
         FROM credit_ledger
         WHERE user_id = $1
           AND type = 'purchase'
           AND idempotency_key = $2`,
        ["billing-api-user-a", `stripe-checkout:${attempt.rows[0]!.attemptId}`],
      ),
    ).resolves.toMatchObject({ rows: [{ count: "1" }] });
  });

  function request(path: string, init?: RequestInit): Promise<Response> {
    const server = app.getHttpServer() as Server;
    const address = server.address() as AddressInfo;
    return fetch(`http://127.0.0.1:${address.port}${path}`, init);
  }
});
