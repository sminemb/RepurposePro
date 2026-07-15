import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  foreignKey,
  integer,
  index,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

export const projectOutputTypeEnum = pgEnum("project_output_type", ["clips", "summary"]);

export const projectStatusEnum = pgEnum("project_status", [
  "draft",
  "uploaded",
  "waiting_for_payment",
  "queued",
  "transcribing",
  "analyzing",
  "preview_ready",
  "waiting_for_user_edits",
  "rendering",
  "completed",
  "failed",
  "refunded",
  "deleted",
]);

export const processingJobTypeEnum = pgEnum("processing_job_type", [
  "analyze_video",
  "render_clips",
  "render_summary",
  "regenerate_clip_candidate",
  "cleanup_expired_project_files",
]);

export const processingJobStatusEnum = pgEnum("processing_job_status", [
  "queued",
  "active",
  "completed",
  "failed",
  "refunded",
  "cancelled",
]);

export const processingJobStepEnum = pgEnum("processing_step", [
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

export const ledgerTypeEnum = pgEnum("ledger_type", [
  "purchase",
  "processing_deduction",
  "refund",
  "manual_adjustment",
  "expiration_adjustment",
]);

export const stripePaymentStatusEnum = pgEnum("stripe_payment_status", [
  "pending",
  "paid",
  "failed",
  "refunded",
]);

export const stripeWebhookEventStatusEnum = pgEnum("stripe_webhook_event_status", [
  "received",
  "processed",
  "failed",
  "ignored",
]);

export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    emailVerified: boolean("email_verified").default(false).notNull(),
    image: text("image"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("users_email_unique").on(table.email)],
);

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (table) => [
    index("sessions_user_id_idx").on(table.userId),
    uniqueIndex("sessions_token_unique").on(table.token),
  ],
);

export const accounts = pgTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("accounts_user_id_idx").on(table.userId)],
);

export const verifications = pgTable(
  "verifications",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("verifications_identifier_idx").on(table.identifier)],
);

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 120 }).notNull(),
    outputType: projectOutputTypeEnum("output_type").notNull(),
    status: projectStatusEnum("status").default("draft").notNull(),
    currentJobId: uuid("current_job_id").references((): AnyPgColumn => processingJobs.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("projects_user_created_at_idx").on(table.userId, table.createdAt),
    index("projects_user_status_idx").on(table.userId, table.status),
    unique("projects_id_user_id_unique").on(table.id, table.userId),
  ],
);

export const uploadedVideos = pgTable(
  "uploaded_videos",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    originalFileName: text("original_file_name").notNull(),
    storagePath: text("storage_path").notNull(),
    mimeType: text("mime_type").notNull(),
    fileSizeBytes: bigint("file_size_bytes", { mode: "number" }).notNull(),
    durationSeconds: numeric("duration_seconds", { precision: 12, scale: 3 }).notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    fps: numeric("fps", { precision: 12, scale: 6 }),
    videoCodec: text("video_codec"),
    audioCodec: text("audio_codec"),
    hasAudio: boolean("has_audio").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("uploaded_videos_project_id_unique").on(table.projectId),
    index("uploaded_videos_expires_at_idx").on(table.expiresAt),
  ],
);

export const processingJobs = pgTable(
  "processing_jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: processingJobTypeEnum("type").notNull(),
    status: processingJobStatusEnum("status").default("queued").notNull(),
    step: processingJobStepEnum("step"),
    progress: integer("progress"),
    creditsCharged: integer("credits_charged").default(0).notNull(),
    refundEligible: boolean("refund_eligible").default(false).notNull(),
    refundCompletedAt: timestamp("refund_completed_at", { withTimezone: true }),
    attemptCount: integer("attempt_count").default(0).notNull(),
    bullmqJobId: text("bullmq_job_id"),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("processing_jobs_project_created_at_idx").on(table.projectId, table.createdAt),
    index("processing_jobs_user_created_at_idx").on(table.userId, table.createdAt),
    index("processing_jobs_status_created_at_idx").on(table.status, table.createdAt),
    unique("processing_jobs_id_user_id_unique").on(table.id, table.userId),
    unique("processing_jobs_id_project_id_user_id_unique").on(
      table.id,
      table.projectId,
      table.userId,
    ),
    foreignKey({
      name: "processing_jobs_project_owner_fk",
      columns: [table.projectId, table.userId],
      foreignColumns: [projects.id, projects.userId],
    }).onDelete("cascade"),
    check(
      "processing_jobs_progress_check",
      sql`${table.progress} IS NULL OR (${table.progress} >= 0 AND ${table.progress} <= 100)`,
    ),
    check("processing_jobs_credits_charged_check", sql`${table.creditsCharged} >= 0`),
    check("processing_jobs_attempt_count_check", sql`${table.attemptCount} >= 0`),
  ],
);

export const stripeCustomers = pgTable(
  "stripe_customers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    stripeCustomerId: text("stripe_customer_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("stripe_customers_user_id_unique").on(table.userId),
    uniqueIndex("stripe_customers_stripe_customer_id_unique").on(table.stripeCustomerId),
    unique("stripe_customers_user_id_stripe_customer_id_unique").on(
      table.userId,
      table.stripeCustomerId,
    ),
  ],
);

export const stripePayments = pgTable(
  "stripe_payments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    stripeCustomerId: text("stripe_customer_id"),
    stripeCheckoutSessionId: text("stripe_checkout_session_id"),
    stripePaymentIntentId: text("stripe_payment_intent_id"),
    stripeEventId: text("stripe_event_id").notNull(),
    packCode: text("pack_code").notNull(),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull(),
    creditsGranted: integer("credits_granted").notNull(),
    status: stripePaymentStatusEnum("status").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("stripe_payments_checkout_session_id_unique")
      .on(table.stripeCheckoutSessionId)
      .where(sql`${table.stripeCheckoutSessionId} IS NOT NULL`),
    uniqueIndex("stripe_payments_payment_intent_id_unique")
      .on(table.stripePaymentIntentId)
      .where(sql`${table.stripePaymentIntentId} IS NOT NULL`),
    uniqueIndex("stripe_payments_event_id_unique").on(table.stripeEventId),
    unique("stripe_payments_id_user_id_unique").on(table.id, table.userId),
    foreignKey({
      name: "stripe_payments_customer_owner_fk",
      columns: [table.userId, table.stripeCustomerId],
      foreignColumns: [stripeCustomers.userId, stripeCustomers.stripeCustomerId],
    }),
    check(
      "stripe_payments_pack_code_check",
      sql`${table.packCode} IN ('starter', 'creator', 'pro')`,
    ),
    check("stripe_payments_amount_cents_check", sql`${table.amountCents} > 0`),
    check("stripe_payments_credits_granted_check", sql`${table.creditsGranted} > 0`),
  ],
);

export const stripeWebhookEvents = pgTable(
  "stripe_webhook_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    stripeEventId: text("stripe_event_id").notNull(),
    eventType: text("event_type").notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    status: stripeWebhookEventStatusEnum("status").default("received").notNull(),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("stripe_webhook_events_stripe_event_id_unique").on(table.stripeEventId)],
);

export const creditLedger = pgTable(
  "credit_ledger",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    type: ledgerTypeEnum("type").notNull(),
    amount: integer("amount").notNull(),
    projectId: uuid("project_id"),
    processingJobId: uuid("processing_job_id"),
    stripePaymentId: uuid("stripe_payment_id"),
    description: text("description").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("credit_ledger_user_created_at_idx").on(table.userId, table.createdAt),
    index("credit_ledger_project_id_idx").on(table.projectId),
    index("credit_ledger_processing_job_id_idx").on(table.processingJobId),
    uniqueIndex("credit_ledger_idempotency_key_unique").on(table.idempotencyKey),
    uniqueIndex("credit_ledger_purchase_per_payment_unique")
      .on(table.stripePaymentId)
      .where(sql`${table.type} = 'purchase'`),
    uniqueIndex("credit_ledger_refund_per_job_unique")
      .on(table.processingJobId)
      .where(sql`${table.type} = 'refund'`),
    uniqueIndex("credit_ledger_deduction_per_job_unique")
      .on(table.processingJobId)
      .where(sql`${table.type} = 'processing_deduction'`),
    foreignKey({
      name: "credit_ledger_project_owner_fk",
      columns: [table.projectId, table.userId],
      foreignColumns: [projects.id, projects.userId],
    }),
    foreignKey({
      name: "credit_ledger_job_owner_fk",
      columns: [table.processingJobId, table.userId],
      foreignColumns: [processingJobs.id, processingJobs.userId],
    }),
    foreignKey({
      name: "credit_ledger_job_project_owner_fk",
      columns: [table.processingJobId, table.projectId, table.userId],
      foreignColumns: [processingJobs.id, processingJobs.projectId, processingJobs.userId],
    }),
    foreignKey({
      name: "credit_ledger_payment_owner_fk",
      columns: [table.stripePaymentId, table.userId],
      foreignColumns: [stripePayments.id, stripePayments.userId],
    }),
    check("credit_ledger_amount_check", sql`${table.amount} <> 0`),
    check(
      "credit_ledger_type_amount_check",
      sql`(
        (${table.type} IN ('purchase', 'refund') AND ${table.amount} > 0)
        OR (${table.type} = 'processing_deduction' AND ${table.amount} < 0)
        OR ${table.type} IN ('manual_adjustment', 'expiration_adjustment')
      )`,
    ),
    check(
      "credit_ledger_reference_check",
      sql`(
        (${table.type} = 'purchase' AND ${table.stripePaymentId} IS NOT NULL)
        OR (
          ${table.type} IN ('processing_deduction', 'refund')
          AND ${table.projectId} IS NOT NULL
          AND ${table.processingJobId} IS NOT NULL
        )
        OR ${table.type} IN ('manual_adjustment', 'expiration_adjustment')
      )`,
    ),
  ],
);
