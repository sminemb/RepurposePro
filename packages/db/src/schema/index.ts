import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  foreignKey,
  integer,
  index,
  jsonb,
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

export const processingDispatchStatusEnum = pgEnum("processing_dispatch_status", [
  "pending",
  "published",
]);

export const processingFailureIntentStatusEnum = pgEnum("processing_failure_intent_status", [
  "pending",
  "finalized",
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
  "processing",
  "processed",
  "failed",
  "ignored",
]);

export const stripeCheckoutSessionStatusEnum = pgEnum("stripe_checkout_session_status", [
  "creating",
  "open",
  "completed",
  "failed",
  "expired",
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
    executionLeaseToken: uuid("execution_lease_token"),
    executionLeaseOwner: text("execution_lease_owner"),
    executionLeaseExpiresAt: timestamp("execution_lease_expires_at", { withTimezone: true }),
    executionHeartbeatAt: timestamp("execution_heartbeat_at", { withTimezone: true }),
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
    check(
      "processing_jobs_execution_lease_check",
      sql`(
        (
          ${table.executionLeaseToken} IS NULL
          AND ${table.executionLeaseOwner} IS NULL
          AND ${table.executionLeaseExpiresAt} IS NULL
          AND ${table.executionHeartbeatAt} IS NULL
        )
        OR (
          ${table.executionLeaseToken} IS NOT NULL
          AND ${table.executionLeaseOwner} IS NOT NULL
          AND ${table.executionLeaseExpiresAt} IS NOT NULL
          AND ${table.executionHeartbeatAt} IS NOT NULL
        )
      )`,
    ),
  ],
);

export const transcripts = pgTable(
  "transcripts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    processingJobId: uuid("processing_job_id")
      .notNull()
      .references(() => processingJobs.id, { onDelete: "cascade" }),
    uploadedVideoId: uuid("uploaded_video_id")
      .notNull()
      .references(() => uploadedVideos.id, { onDelete: "cascade" }),
    language: varchar("language", { length: 16 }).notNull(),
    model: text("model").notNull(),
    durationSeconds: numeric("duration_seconds", { precision: 12, scale: 3 }).notNull(),
    text: text("text").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("transcripts_processing_job_id_unique").on(table.processingJobId),
    index("transcripts_project_created_at_idx").on(table.projectId, table.createdAt),
    check("transcripts_duration_check", sql`${table.durationSeconds} > 0`),
    check("transcripts_language_check", sql`length(btrim(${table.language})) > 0`),
    check("transcripts_model_check", sql`length(btrim(${table.model})) > 0`),
    check("transcripts_text_check", sql`length(btrim(${table.text})) > 0`),
  ],
);

export const transcriptSegments = pgTable(
  "transcript_segments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    transcriptId: uuid("transcript_id")
      .notNull()
      .references(() => transcripts.id, { onDelete: "cascade" }),
    sequence: integer("sequence").notNull(),
    startSeconds: numeric("start_seconds", { precision: 12, scale: 3 }).notNull(),
    endSeconds: numeric("end_seconds", { precision: 12, scale: 3 }).notNull(),
    text: text("text").notNull(),
    words: jsonb("words"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("transcript_segments_transcript_sequence_unique").on(
      table.transcriptId,
      table.sequence,
    ),
    index("transcript_segments_transcript_start_idx").on(table.transcriptId, table.startSeconds),
    check("transcript_segments_sequence_check", sql`${table.sequence} >= 0`),
    check("transcript_segments_start_check", sql`${table.startSeconds} >= 0`),
    check("transcript_segments_range_check", sql`${table.endSeconds} > ${table.startSeconds}`),
    check("transcript_segments_text_check", sql`length(btrim(${table.text})) > 0`),
    check(
      "transcript_segments_words_check",
      sql`${table.words} IS NULL OR jsonb_typeof(${table.words}) = 'array'`,
    ),
  ],
);

export const processingJobDispatches = pgTable(
  "processing_job_dispatches",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    processingJobId: uuid("processing_job_id")
      .notNull()
      .references(() => processingJobs.id, { onDelete: "cascade" }),
    status: processingDispatchStatusEnum("status").default("pending").notNull(),
    attemptCount: integer("attempt_count").default(0).notNull(),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).defaultNow().notNull(),
    leaseToken: uuid("lease_token"),
    leaseOwner: text("lease_owner"),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    bullmqJobId: text("bullmq_job_id"),
    lastFailureStage: text("last_failure_stage"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("processing_job_dispatches_processing_job_id_unique").on(table.processingJobId),
    index("processing_job_dispatches_pending_idx")
      .on(table.status, table.nextAttemptAt)
      .where(sql`${table.status} = 'pending'`),
    check("processing_job_dispatches_attempt_count_check", sql`${table.attemptCount} >= 0`),
    check(
      "processing_job_dispatches_lease_check",
      sql`(
        (${table.leaseToken} IS NULL AND ${table.leaseOwner} IS NULL AND ${table.leaseExpiresAt} IS NULL)
        OR (
          ${table.leaseToken} IS NOT NULL
          AND ${table.leaseOwner} IS NOT NULL
          AND ${table.leaseExpiresAt} IS NOT NULL
        )
      )`,
    ),
    check(
      "processing_job_dispatches_published_check",
      sql`(
        (${table.status} = 'pending' AND ${table.publishedAt} IS NULL)
        OR (
          ${table.status} = 'published'
          AND ${table.publishedAt} IS NOT NULL
          AND ${table.bullmqJobId} IS NOT NULL
        )
      )`,
    ),
  ],
);

export const processingFailureIntents = pgTable(
  "processing_failure_intents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    processingJobId: uuid("processing_job_id")
      .notNull()
      .references(() => processingJobs.id, { onDelete: "cascade" }),
    failureCode: text("failure_code").notNull(),
    safeMessage: text("safe_message").notNull(),
    sourceReference: text("source_reference").notNull(),
    status: processingFailureIntentStatusEnum("status").default("pending").notNull(),
    attemptCount: integer("attempt_count").default(0).notNull(),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).defaultNow().notNull(),
    leaseToken: uuid("lease_token"),
    leaseOwner: text("lease_owner"),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    finalizedAt: timestamp("finalized_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("processing_failure_intents_processing_job_id_unique").on(table.processingJobId),
    index("processing_failure_intents_pending_idx")
      .on(table.status, table.nextAttemptAt)
      .where(sql`${table.status} = 'pending'`),
    check("processing_failure_intents_attempt_count_check", sql`${table.attemptCount} >= 0`),
    check(
      "processing_failure_intents_failure_code_check",
      sql`${table.failureCode} <> '' AND length(${table.failureCode}) <= 100`,
    ),
    check(
      "processing_failure_intents_safe_message_check",
      sql`${table.safeMessage} <> '' AND length(${table.safeMessage}) <= 500`,
    ),
    check(
      "processing_failure_intents_source_reference_check",
      sql`${table.sourceReference} <> '' AND length(${table.sourceReference}) <= 200`,
    ),
    check(
      "processing_failure_intents_lease_check",
      sql`(
        (
          ${table.leaseToken} IS NULL
          AND ${table.leaseOwner} IS NULL
          AND ${table.leaseExpiresAt} IS NULL
        )
        OR (
          ${table.leaseToken} IS NOT NULL
          AND ${table.leaseOwner} IS NOT NULL
          AND ${table.leaseExpiresAt} IS NOT NULL
        )
      )`,
    ),
    check(
      "processing_failure_intents_finalized_check",
      sql`(
        (${table.status} = 'pending' AND ${table.finalizedAt} IS NULL)
        OR (${table.status} = 'finalized' AND ${table.finalizedAt} IS NOT NULL)
      )`,
    ),
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

export const stripeCheckoutSessions = pgTable(
  "stripe_checkout_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    packCode: text("pack_code").notNull(),
    stripePriceId: text("stripe_price_id").notNull(),
    stripeSessionId: text("stripe_session_id"),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull(),
    credits: integer("credits").notNull(),
    livemode: boolean("livemode").notNull(),
    status: stripeCheckoutSessionStatusEnum("status").default("creating").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("stripe_checkout_sessions_stripe_session_id_unique")
      .on(table.stripeSessionId)
      .where(sql`${table.stripeSessionId} IS NOT NULL`),
    index("stripe_checkout_sessions_user_created_at_idx").on(table.userId, table.createdAt),
    check(
      "stripe_checkout_sessions_pack_code_check",
      sql`${table.packCode} IN ('starter', 'creator', 'pro')`,
    ),
    check("stripe_checkout_sessions_price_id_check", sql`${table.stripePriceId} <> ''`),
    check("stripe_checkout_sessions_amount_cents_check", sql`${table.amountCents} > 0`),
    check("stripe_checkout_sessions_credits_check", sql`${table.credits} > 0`),
    check(
      "stripe_checkout_sessions_binding_check",
      sql`(
        (${table.status} IN ('creating', 'failed') AND ${table.stripeSessionId} IS NULL)
        OR (
          ${table.status} IN ('open', 'completed', 'expired')
          AND ${table.stripeSessionId} IS NOT NULL
          AND ${table.expiresAt} IS NOT NULL
        )
      )`,
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
    attemptCount: integer("attempt_count").default(0).notNull(),
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("stripe_webhook_events_stripe_event_id_unique").on(table.stripeEventId),
    check("stripe_webhook_events_attempt_count_check", sql`${table.attemptCount} >= 0`),
  ],
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
