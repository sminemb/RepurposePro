import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import {
  creditLedger,
  ledgerTypeEnum,
  processingJobStatusEnum,
  processingJobStepEnum,
  processingJobTypeEnum,
  processingJobs,
  projects,
  stripeCustomers,
  stripePaymentStatusEnum,
  stripePayments,
  stripeWebhookEventStatusEnum,
  stripeWebhookEvents,
} from "./index.js";

function names(values: readonly { readonly name: string }[]): string[] {
  return values.map((value) => value.name);
}

describe("VS3 billing schema", () => {
  const migration = readFileSync(
    resolve(process.cwd(), "packages/db/drizzle/0005_add_vs3_billing_schema.sql"),
    "utf8",
  );
  const hardeningMigration = readFileSync(
    resolve(process.cwd(), "packages/db/drizzle/0006_harden_vs3_billing_integrity.sql"),
    "utf8",
  );
  const duplicatePurchaseMigration = readFileSync(
    resolve(process.cwd(), "packages/db/drizzle/0007_prevent_duplicate_purchase_grants.sql"),
    "utf8",
  );
  const integrityMigration = readFileSync(
    resolve(process.cwd(), "packages/db/drizzle/0008_harden_billing_integrity.sql"),
    "utf8",
  );
  const migrationTrackingOwnershipMigration = readFileSync(
    resolve(process.cwd(), "packages/db/drizzle/0009_transfer_drizzle_tracking_ownership.sql"),
    "utf8",
  );
  const runtimeRoleBoundaryMigration = readFileSync(
    resolve(process.cwd(), "packages/db/drizzle/0010_harden_runtime_role_boundary.sql"),
    "utf8",
  );

  it("exports documented processing, ledger, payment, and webhook enums", () => {
    expect(processingJobTypeEnum.enumValues).toEqual([
      "analyze_video",
      "render_clips",
      "render_summary",
      "regenerate_clip_candidate",
      "cleanup_expired_project_files",
    ]);
    expect(processingJobStatusEnum.enumValues).toEqual([
      "queued",
      "active",
      "completed",
      "failed",
      "refunded",
      "cancelled",
    ]);
    expect(processingJobStepEnum.enumValues).toEqual([
      "queued",
      "preparing",
      "extracting_audio",
      "transcribing",
      "analyzing",
      "generating_preview",
      "preview_ready",
      "rendering",
      "saving_output",
      "completed",
      "failed",
    ]);
    expect(ledgerTypeEnum.enumValues).toEqual([
      "purchase",
      "processing_deduction",
      "refund",
      "manual_adjustment",
      "expiration_adjustment",
    ]);
    expect(stripePaymentStatusEnum.enumValues).toEqual(["pending", "paid", "failed", "refunded"]);
    expect(stripeWebhookEventStatusEnum.enumValues).toEqual([
      "received",
      "processed",
      "failed",
      "ignored",
    ]);
  });

  it("defines durable jobs and an owned current-job pointer", () => {
    const jobConfig = getTableConfig(processingJobs);
    const projectConfig = getTableConfig(projects);
    const uniqueConstraintNames = jobConfig.uniqueConstraints.map((constraint) =>
      constraint.getName(),
    );

    expect(names(jobConfig.columns)).toEqual(
      expect.arrayContaining([
        "id",
        "project_id",
        "user_id",
        "type",
        "status",
        "step",
        "progress",
        "credits_charged",
        "refund_eligible",
        "refund_completed_at",
        "attempt_count",
        "bullmq_job_id",
        "error_code",
        "error_message",
        "started_at",
        "completed_at",
        "created_at",
        "updated_at",
      ]),
    );
    expect(names(jobConfig.checks)).toEqual(
      expect.arrayContaining([
        "processing_jobs_progress_check",
        "processing_jobs_credits_charged_check",
        "processing_jobs_attempt_count_check",
      ]),
    );
    expect(uniqueConstraintNames).toEqual(
      expect.arrayContaining([
        "processing_jobs_id_user_id_unique",
        "processing_jobs_id_project_id_user_id_unique",
      ]),
    );
    expect(projectConfig.foreignKeys.some((key) => key.onDelete === "set null")).toBe(true);
  });

  it("defines immutable, idempotent credit movement", () => {
    const config = getTableConfig(creditLedger);
    const indexNames = config.indexes.map((index) => index.config.name);
    const foreignKeyNames = config.foreignKeys.map((key) => key.getName());

    expect(names(config.columns)).toEqual(
      expect.arrayContaining([
        "id",
        "user_id",
        "type",
        "amount",
        "project_id",
        "processing_job_id",
        "stripe_payment_id",
        "description",
        "idempotency_key",
        "created_at",
      ]),
    );
    expect(names(config.checks)).toEqual(
      expect.arrayContaining([
        "credit_ledger_amount_check",
        "credit_ledger_type_amount_check",
        "credit_ledger_reference_check",
      ]),
    );
    expect(indexNames).toEqual(
      expect.arrayContaining([
        "credit_ledger_idempotency_key_unique",
        "credit_ledger_purchase_per_payment_unique",
        "credit_ledger_refund_per_job_unique",
        "credit_ledger_deduction_per_job_unique",
      ]),
    );
    expect(foreignKeyNames).toContain("credit_ledger_job_project_owner_fk");
  });

  it("adds database triggers for ledger immutability and current-job ownership", () => {
    expect(migration).toContain("CREATE FUNCTION prevent_credit_ledger_mutation()");
    expect(migration).toContain("CREATE TRIGGER credit_ledger_immutable");
    expect(migration).toContain("CREATE FUNCTION validate_project_current_job_ownership()");
    expect(migration).toContain("CREATE TRIGGER projects_current_job_owner_check");
  });

  it("hardens job ownership, paid purchases, and ledger truncation", () => {
    expect(hardeningMigration).toContain("CREATE TRIGGER processing_jobs_owner_immutable");
    expect(hardeningMigration).toContain("CREATE FUNCTION validate_credit_ledger_purchase()");
    expect(hardeningMigration).toContain("CREATE TRIGGER credit_ledger_purchase_validation");
    expect(hardeningMigration).toContain("CREATE TRIGGER credit_ledger_truncate_immutable");
    expect(duplicatePurchaseMigration).toContain(
      'CREATE UNIQUE INDEX "credit_ledger_purchase_per_payment_unique"',
    );
  });

  it("locks financial records and keeps runtime credentials restricted", () => {
    expect(integrityMigration).toContain("CREATE TRIGGER processing_jobs_charge_immutable");
    expect(integrityMigration).toContain(
      "CREATE TRIGGER credit_ledger_processing_charge_validation",
    );
    expect(integrityMigration).toContain("CREATE TRIGGER stripe_payments_immutable");
    expect(integrityMigration).toContain("CREATE TRIGGER stripe_customers_immutable");
    expect(integrityMigration).toContain("CREATE TRIGGER stripe_webhook_events_immutable");
    expect(integrityMigration).toContain(
      "ALTER TABLE credit_ledger ENABLE ALWAYS TRIGGER credit_ledger_immutable",
    );
    expect(integrityMigration).toContain("REVOKE ALL ON TABLE credit_ledger FROM PUBLIC");
    expect(integrityMigration).toContain("GRANT SELECT ON TABLE credit_ledger");
  });

  it("transfers Drizzle migration tracking to the non-superuser migration owner", () => {
    expect(migrationTrackingOwnershipMigration).toContain("ALTER SCHEMA drizzle OWNER TO");
    expect(migrationTrackingOwnershipMigration).toContain(
      "ALTER TABLE drizzle.__drizzle_migrations OWNER TO",
    );
  });

  it("prevents runtime TEMP shadowing of the current-job ownership trigger", () => {
    expect(runtimeRoleBoundaryMigration).toContain("FROM public.processing_jobs");
    expect(runtimeRoleBoundaryMigration).toContain(
      "SET search_path TO pg_catalog, public, pg_temp",
    );
    expect(runtimeRoleBoundaryMigration).toContain("REVOKE CREATE, TEMPORARY ON DATABASE");
  });

  it("creates composite foreign-key targets before dependent ledger constraints", () => {
    expect(
      migration.indexOf('ALTER TABLE "projects" ADD CONSTRAINT "projects_id_user_id_unique"'),
    ).toBeLessThan(
      migration.indexOf(
        'ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_project_owner_fk"',
      ),
    );
  });

  it("defines Stripe records with owner-safe, duplicate-safe identifiers", () => {
    const customerConfig = getTableConfig(stripeCustomers);
    const paymentConfig = getTableConfig(stripePayments);
    const eventConfig = getTableConfig(stripeWebhookEvents);
    const paymentIndexNames = paymentConfig.indexes.map((index) => index.config.name);

    expect(names(customerConfig.columns)).toEqual(
      expect.arrayContaining(["id", "user_id", "stripe_customer_id", "created_at", "updated_at"]),
    );
    expect(names(paymentConfig.columns)).toEqual(
      expect.arrayContaining([
        "id",
        "user_id",
        "stripe_customer_id",
        "stripe_checkout_session_id",
        "stripe_payment_intent_id",
        "stripe_event_id",
        "pack_code",
        "amount_cents",
        "currency",
        "credits_granted",
        "status",
        "created_at",
      ]),
    );
    expect(paymentIndexNames).toEqual(
      expect.arrayContaining([
        "stripe_payments_checkout_session_id_unique",
        "stripe_payments_payment_intent_id_unique",
        "stripe_payments_event_id_unique",
      ]),
    );
    expect(names(eventConfig.columns)).toEqual(
      expect.arrayContaining([
        "id",
        "stripe_event_id",
        "event_type",
        "processed_at",
        "status",
        "error_message",
        "created_at",
      ]),
    );
  });
});
