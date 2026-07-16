import { randomUUID } from "node:crypto";
import { resolve } from "node:path";

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

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

describeIntegration("billing integrity migrations", () => {
  const database = `repurposepro_billing_${randomUUID().replaceAll("-", "")}`;
  const bootstrapDatabaseUrl = withDatabase(bootstrapUrl, database);
  const migrationDatabaseUrl = withDatabase(migrationUrl, database);
  const runtimeDatabaseUrl = withDatabase(runtimeUrl, database);
  const bootstrapDatabasePool = new Pool({ connectionString: bootstrapDatabaseUrl });
  const migrationPool = new Pool({ connectionString: migrationDatabaseUrl });
  const runtimePool = new Pool({ connectionString: runtimeDatabaseUrl });
  const adminPool = new Pool({ connectionString: bootstrapUrl ?? skippedDatabaseUrl });

  beforeAll(async () => {
    await adminPool.query(`CREATE DATABASE ${database} OWNER repurposepro_owner`);

    const migrationDatabase = drizzle({ client: migrationPool });
    const migrationsFolder = resolve(process.cwd(), "packages/db/drizzle");

    await migrate(migrationDatabase, { migrationsFolder });
    await migrate(migrationDatabase, { migrationsFolder });

    await runtimePool.query("SELECT 1");
  });

  afterAll(async () => {
    await runtimePool.end();
    await migrationPool.end();
    await bootstrapDatabasePool.end();
    await adminPool.query(`DROP DATABASE IF EXISTS ${database} WITH (FORCE)`);
    await adminPool.end();
  });

  it("uses a restricted runtime role after rerunning migrations", async () => {
    const migrationRole = await migrationPool.query<{
      currentUser: string;
      isSuperuser: boolean;
      canCreateRole: boolean;
      canCreateDatabase: boolean;
      canReplicate: boolean;
      bypassesRowSecurity: boolean;
    }>(`
      SELECT
        current_user AS "currentUser",
        rolsuper AS "isSuperuser",
        rolcreaterole AS "canCreateRole",
        rolcreatedb AS "canCreateDatabase",
        rolreplication AS "canReplicate",
        rolbypassrls AS "bypassesRowSecurity"
      FROM pg_roles
      WHERE rolname = current_user
    `);
    const role = await runtimePool.query<{
      currentUser: string;
      isSuperuser: boolean;
      canCreateRole: boolean;
      canCreateDatabase: boolean;
      canReplicate: boolean;
      bypassesRowSecurity: boolean;
    }>(`
      SELECT
        current_user AS "currentUser",
        rolsuper AS "isSuperuser",
        rolcreaterole AS "canCreateRole",
        rolcreatedb AS "canCreateDatabase",
        rolreplication AS "canReplicate",
        rolbypassrls AS "bypassesRowSecurity"
      FROM pg_roles
      WHERE rolname = current_user
    `);

    expect(role.rows[0]).toEqual({
      currentUser: "repurposepro_runtime",
      isSuperuser: false,
      canCreateRole: false,
      canCreateDatabase: false,
      canReplicate: false,
      bypassesRowSecurity: false,
    });
    expect(migrationRole.rows[0]).toEqual({
      currentUser: "repurposepro_owner",
      isSuperuser: false,
      canCreateRole: false,
      canCreateDatabase: false,
      canReplicate: false,
      bypassesRowSecurity: false,
    });
    const canUseOwnerRole = await runtimePool.query<{ canUseOwnerRole: boolean }>(`
      SELECT pg_has_role(current_user, 'repurposepro_owner', 'USAGE') AS "canUseOwnerRole"
    `);

    expect(canUseOwnerRole.rows[0]?.canUseOwnerRole).toBe(false);
    await expect(
      runtimePool.query("SET LOCAL session_replication_role = replica"),
    ).rejects.toMatchObject({
      code: "42501",
    });
    await expect(
      runtimePool.query("ALTER TABLE credit_ledger DISABLE TRIGGER ALL"),
    ).rejects.toMatchObject({
      code: "42501",
    });
    await expect(runtimePool.query("SET ROLE repurposepro_owner")).rejects.toMatchObject({
      code: "42501",
    });
    await expect(
      runtimePool.query("CREATE TEMPORARY TABLE processing_jobs (id uuid)"),
    ).rejects.toMatchObject({
      code: "42501",
    });
  });

  it("locks Stripe payment identity and financial terms while allowing legal status changes", async () => {
    await migrationPool.query("INSERT INTO users (id, name, email) VALUES ($1, $2, $3)", [
      "billing-integrity-user",
      "Billing Integrity User",
      "billing-integrity@example.test",
    ]);
    await migrationPool.query(
      "INSERT INTO stripe_customers (id, user_id, stripe_customer_id) VALUES ($1, $2, $3)",
      ["00000000-0000-0000-0000-000000000101", "billing-integrity-user", "cus_billing_integrity"],
    );
    await migrationPool.query(
      `INSERT INTO stripe_payments (
        id, user_id, stripe_customer_id, stripe_checkout_session_id, stripe_payment_intent_id,
        stripe_event_id, pack_code, amount_cents, currency, credits_granted, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        "00000000-0000-0000-0000-000000000102",
        "billing-integrity-user",
        "cus_billing_integrity",
        "cs_billing_integrity",
        "pi_billing_integrity",
        "evt_billing_integrity",
        "starter",
        1000,
        "usd",
        40,
        "paid",
      ],
    );
    await migrationPool.query(
      "INSERT INTO stripe_webhook_events (id, stripe_event_id, event_type) VALUES ($1, $2, $3)",
      [
        "00000000-0000-0000-0000-000000000111",
        "evt_webhook_billing_integrity",
        "checkout.session.completed",
      ],
    );
    await migrationPool.query(
      `INSERT INTO stripe_payments (
        id, user_id, stripe_customer_id, stripe_checkout_session_id, stripe_payment_intent_id,
        stripe_event_id, pack_code, amount_cents, currency, credits_granted, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        "00000000-0000-0000-0000-000000000103",
        "billing-integrity-user",
        "cus_billing_integrity",
        "cs_billing_integrity_pending",
        "pi_billing_integrity_pending",
        "evt_billing_integrity_pending",
        "starter",
        1000,
        "usd",
        40,
        "pending",
      ],
    );

    await expect(
      migrationPool.query("UPDATE stripe_payments SET stripe_event_id = $1 WHERE id = $2", [
        "evt_rewritten",
        "00000000-0000-0000-0000-000000000102",
      ]),
    ).rejects.toMatchObject({ code: "55000" });
    await expect(
      migrationPool.query("UPDATE stripe_payments SET credits_granted = $1 WHERE id = $2", [
        80,
        "00000000-0000-0000-0000-000000000102",
      ]),
    ).rejects.toMatchObject({ code: "55000" });
    await expect(
      migrationPool.query("UPDATE stripe_customers SET stripe_customer_id = $1 WHERE id = $2", [
        "cus_rewritten",
        "00000000-0000-0000-0000-000000000101",
      ]),
    ).rejects.toMatchObject({ code: "55000" });
    await expect(
      migrationPool.query("UPDATE stripe_webhook_events SET stripe_event_id = $1 WHERE id = $2", [
        "evt_webhook_rewritten",
        "00000000-0000-0000-0000-000000000111",
      ]),
    ).rejects.toMatchObject({ code: "55000" });

    await expect(
      migrationPool.query("UPDATE stripe_payments SET status = 'paid' WHERE id = $1", [
        "00000000-0000-0000-0000-000000000103",
      ]),
    ).resolves.toBeDefined();
    await expect(
      migrationPool.query("UPDATE stripe_payments SET status = 'failed' WHERE id = $1", [
        "00000000-0000-0000-0000-000000000103",
      ]),
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      migrationPool.query(
        "UPDATE stripe_webhook_events SET status = 'processed', processed_at = now() WHERE id = $1",
        ["00000000-0000-0000-0000-000000000111"],
      ),
    ).resolves.toBeDefined();
  });

  it("requires deductions and refunds to match an immutable job charge", async () => {
    await migrationPool.query(
      "INSERT INTO projects (id, user_id, name, output_type, status) VALUES ($1, $2, $3, $4, $5)",
      [
        "00000000-0000-0000-0000-000000000104",
        "billing-integrity-user",
        "Billing integrity project",
        "clips",
        "draft",
      ],
    );
    await migrationPool.query(
      `INSERT INTO processing_jobs (id, project_id, user_id, type, status, credits_charged)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        "00000000-0000-0000-0000-000000000105",
        "00000000-0000-0000-0000-000000000104",
        "billing-integrity-user",
        "analyze_video",
        "queued",
        11,
      ],
    );

    await expect(
      migrationPool.query(
        `INSERT INTO credit_ledger (
          id, user_id, type, amount, project_id, processing_job_id, description, idempotency_key
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          "00000000-0000-0000-0000-000000000106",
          "billing-integrity-user",
          "processing_deduction",
          -1,
          "00000000-0000-0000-0000-000000000104",
          "00000000-0000-0000-0000-000000000105",
          "Wrong deduction",
          "billing-integrity-wrong-deduction",
        ],
      ),
    ).rejects.toMatchObject({ code: "23514" });
    await migrationPool.query(
      `INSERT INTO credit_ledger (
        id, user_id, type, amount, project_id, processing_job_id, description, idempotency_key
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        "00000000-0000-0000-0000-000000000107",
        "billing-integrity-user",
        "processing_deduction",
        -11,
        "00000000-0000-0000-0000-000000000104",
        "00000000-0000-0000-0000-000000000105",
        "Correct deduction",
        "billing-integrity-correct-deduction",
      ],
    );
    await expect(
      migrationPool.query(
        `INSERT INTO credit_ledger (
          id, user_id, type, amount, project_id, processing_job_id, description, idempotency_key
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          "00000000-0000-0000-0000-000000000108",
          "billing-integrity-user",
          "refund",
          999,
          "00000000-0000-0000-0000-000000000104",
          "00000000-0000-0000-0000-000000000105",
          "Wrong refund",
          "billing-integrity-wrong-refund",
        ],
      ),
    ).rejects.toMatchObject({ code: "23514" });
    await migrationPool.query(
      "UPDATE processing_jobs SET status = 'failed', refund_eligible = true WHERE id = $1",
      ["00000000-0000-0000-0000-000000000105"],
    );
    await expect(
      migrationPool.query(
        `INSERT INTO credit_ledger (
          id, user_id, type, amount, project_id, processing_job_id, description, idempotency_key
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          "00000000-0000-0000-0000-000000000112",
          "billing-integrity-user",
          "refund",
          11,
          "00000000-0000-0000-0000-000000000104",
          "00000000-0000-0000-0000-000000000105",
          "Correct refund",
          "billing-integrity-correct-refund",
        ],
      ),
    ).resolves.toBeDefined();
    await expect(
      migrationPool.query("UPDATE processing_jobs SET credits_charged = 1 WHERE id = $1", [
        "00000000-0000-0000-0000-000000000105",
      ]),
    ).rejects.toMatchObject({ code: "55000" });

    await expect(
      runtimePool.query(
        `INSERT INTO credit_ledger (
          id, user_id, type, amount, description, idempotency_key
        ) VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          "00000000-0000-0000-0000-000000000109",
          "billing-integrity-user",
          "manual_adjustment",
          999,
          "Runtime credit mint",
          "billing-integrity-runtime-mint",
        ],
      ),
    ).rejects.toMatchObject({ code: "42501" });
    await expect(runtimePool.query("TRUNCATE credit_ledger")).rejects.toMatchObject({
      code: "42501",
    });
    await expect(
      runtimePool.query(
        `INSERT INTO stripe_payments (
          id, user_id, stripe_event_id, pack_code, amount_cents, currency, credits_granted, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          "00000000-0000-0000-0000-000000000110",
          "billing-integrity-user",
          "evt_runtime_mint",
          "starter",
          1000,
          "usd",
          40,
          "paid",
        ],
      ),
    ).rejects.toMatchObject({ code: "42501" });

    const ownerClient = await bootstrapDatabasePool.connect();
    try {
      await ownerClient.query("BEGIN");
      await ownerClient.query("SET LOCAL session_replication_role = replica");
      await expect(
        ownerClient.query("UPDATE credit_ledger SET description = $1 WHERE id = $2", [
          "Attempted trigger bypass",
          "00000000-0000-0000-0000-000000000107",
        ]),
      ).rejects.toMatchObject({ code: "55000" });
    } finally {
      await ownerClient.query("ROLLBACK");
      ownerClient.release();
    }
  });

  it("returns a user-scoped credit aggregate to the restricted runtime role", async () => {
    await migrationPool.query(
      "INSERT INTO users (id, name, email) VALUES ($1, $2, $3), ($4, $5, $6)",
      [
        "billing-balance-user-a",
        "Billing Balance User A",
        "billing-balance-a@example.test",
        "billing-balance-user-b",
        "Billing Balance User B",
        "billing-balance-b@example.test",
      ],
    );
    await migrationPool.query(
      `INSERT INTO credit_ledger (id, user_id, type, amount, description, idempotency_key)
       VALUES ($1, $2, $3, $4, $5, $6), ($7, $2, $3, $8, $9, $10), ($11, $12, $3, $13, $14, $15)`,
      [
        "00000000-0000-0000-0000-000000000201",
        "billing-balance-user-a",
        "manual_adjustment",
        40,
        "Balance credit",
        "billing-balance-credit",
        "00000000-0000-0000-0000-000000000202",
        -11,
        "Balance debit",
        "billing-balance-debit",
        "00000000-0000-0000-0000-000000000203",
        "billing-balance-user-b",
        999,
        "Other user balance",
        "billing-balance-other-user",
      ],
    );

    const result = await runtimePool.query<{ balance: string }>(
      `SELECT COALESCE(SUM(amount), 0)::text AS balance
       FROM credit_ledger
       WHERE user_id = $1`,
      ["billing-balance-user-a"],
    );

    expect(result.rows).toEqual([{ balance: "29" }]);
    expect(typeof result.rows[0]?.balance).toBe("string");
  });
});
