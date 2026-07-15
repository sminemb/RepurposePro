CREATE TYPE "public"."ledger_type" AS ENUM('purchase', 'processing_deduction', 'refund', 'manual_adjustment', 'expiration_adjustment');--> statement-breakpoint
CREATE TYPE "public"."processing_job_status" AS ENUM('queued', 'active', 'completed', 'failed', 'refunded', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."processing_step" AS ENUM('queued', 'preparing', 'extracting_audio', 'transcribing', 'analyzing', 'generating_preview', 'preview_ready', 'rendering', 'saving_output', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."processing_job_type" AS ENUM('analyze_video', 'render_clips', 'render_summary', 'regenerate_clip_candidate', 'cleanup_expired_project_files');--> statement-breakpoint
CREATE TYPE "public"."stripe_payment_status" AS ENUM('pending', 'paid', 'failed', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."stripe_webhook_event_status" AS ENUM('received', 'processed', 'failed', 'ignored');--> statement-breakpoint
CREATE TABLE "credit_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"type" "ledger_type" NOT NULL,
	"amount" integer NOT NULL,
	"project_id" uuid,
	"processing_job_id" uuid,
	"stripe_payment_id" uuid,
	"description" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "credit_ledger_amount_check" CHECK ("credit_ledger"."amount" <> 0),
	CONSTRAINT "credit_ledger_type_amount_check" CHECK ((
        ("credit_ledger"."type" IN ('purchase', 'refund') AND "credit_ledger"."amount" > 0)
        OR ("credit_ledger"."type" = 'processing_deduction' AND "credit_ledger"."amount" < 0)
        OR "credit_ledger"."type" IN ('manual_adjustment', 'expiration_adjustment')
      )),
	CONSTRAINT "credit_ledger_reference_check" CHECK ((
        ("credit_ledger"."type" = 'purchase' AND "credit_ledger"."stripe_payment_id" IS NOT NULL)
        OR (
          "credit_ledger"."type" IN ('processing_deduction', 'refund')
          AND "credit_ledger"."project_id" IS NOT NULL
          AND "credit_ledger"."processing_job_id" IS NOT NULL
        )
        OR "credit_ledger"."type" IN ('manual_adjustment', 'expiration_adjustment')
      ))
);
--> statement-breakpoint
CREATE TABLE "processing_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"type" "processing_job_type" NOT NULL,
	"status" "processing_job_status" DEFAULT 'queued' NOT NULL,
	"step" "processing_step",
	"progress" integer,
	"credits_charged" integer DEFAULT 0 NOT NULL,
	"refund_eligible" boolean DEFAULT false NOT NULL,
	"refund_completed_at" timestamp with time zone,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"bullmq_job_id" text,
	"error_code" text,
	"error_message" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "processing_jobs_id_user_id_unique" UNIQUE("id","user_id"),
	CONSTRAINT "processing_jobs_progress_check" CHECK ("processing_jobs"."progress" IS NULL OR ("processing_jobs"."progress" >= 0 AND "processing_jobs"."progress" <= 100)),
	CONSTRAINT "processing_jobs_credits_charged_check" CHECK ("processing_jobs"."credits_charged" >= 0),
	CONSTRAINT "processing_jobs_attempt_count_check" CHECK ("processing_jobs"."attempt_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "stripe_customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"stripe_customer_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stripe_customers_user_id_stripe_customer_id_unique" UNIQUE("user_id","stripe_customer_id")
);
--> statement-breakpoint
CREATE TABLE "stripe_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"stripe_customer_id" text,
	"stripe_checkout_session_id" text,
	"stripe_payment_intent_id" text,
	"stripe_event_id" text NOT NULL,
	"pack_code" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" text NOT NULL,
	"credits_granted" integer NOT NULL,
	"status" "stripe_payment_status" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stripe_payments_id_user_id_unique" UNIQUE("id","user_id"),
	CONSTRAINT "stripe_payments_pack_code_check" CHECK ("stripe_payments"."pack_code" IN ('starter', 'creator', 'pro')),
	CONSTRAINT "stripe_payments_amount_cents_check" CHECK ("stripe_payments"."amount_cents" > 0),
	CONSTRAINT "stripe_payments_credits_granted_check" CHECK ("stripe_payments"."credits_granted" > 0)
);
--> statement-breakpoint
CREATE TABLE "stripe_webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stripe_event_id" text NOT NULL,
	"event_type" text NOT NULL,
	"processed_at" timestamp with time zone,
	"status" "stripe_webhook_event_status" DEFAULT 'received' NOT NULL,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "current_job_id" uuid;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_id_user_id_unique" UNIQUE("id","user_id");--> statement-breakpoint
ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_project_owner_fk" FOREIGN KEY ("project_id","user_id") REFERENCES "public"."projects"("id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_job_owner_fk" FOREIGN KEY ("processing_job_id","user_id") REFERENCES "public"."processing_jobs"("id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_payment_owner_fk" FOREIGN KEY ("stripe_payment_id","user_id") REFERENCES "public"."stripe_payments"("id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "processing_jobs" ADD CONSTRAINT "processing_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "processing_jobs" ADD CONSTRAINT "processing_jobs_project_owner_fk" FOREIGN KEY ("project_id","user_id") REFERENCES "public"."projects"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stripe_customers" ADD CONSTRAINT "stripe_customers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stripe_payments" ADD CONSTRAINT "stripe_payments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stripe_payments" ADD CONSTRAINT "stripe_payments_customer_owner_fk" FOREIGN KEY ("user_id","stripe_customer_id") REFERENCES "public"."stripe_customers"("user_id","stripe_customer_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "credit_ledger_user_created_at_idx" ON "credit_ledger" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "credit_ledger_project_id_idx" ON "credit_ledger" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "credit_ledger_processing_job_id_idx" ON "credit_ledger" USING btree ("processing_job_id");--> statement-breakpoint
CREATE UNIQUE INDEX "credit_ledger_idempotency_key_unique" ON "credit_ledger" USING btree ("idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "credit_ledger_refund_per_job_unique" ON "credit_ledger" USING btree ("processing_job_id") WHERE "credit_ledger"."type" = 'refund';--> statement-breakpoint
CREATE UNIQUE INDEX "credit_ledger_deduction_per_job_unique" ON "credit_ledger" USING btree ("processing_job_id") WHERE "credit_ledger"."type" = 'processing_deduction';--> statement-breakpoint
CREATE INDEX "processing_jobs_project_created_at_idx" ON "processing_jobs" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE INDEX "processing_jobs_user_created_at_idx" ON "processing_jobs" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "processing_jobs_status_created_at_idx" ON "processing_jobs" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "stripe_customers_user_id_unique" ON "stripe_customers" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "stripe_customers_stripe_customer_id_unique" ON "stripe_customers" USING btree ("stripe_customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "stripe_payments_checkout_session_id_unique" ON "stripe_payments" USING btree ("stripe_checkout_session_id") WHERE "stripe_payments"."stripe_checkout_session_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "stripe_payments_payment_intent_id_unique" ON "stripe_payments" USING btree ("stripe_payment_intent_id") WHERE "stripe_payments"."stripe_payment_intent_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "stripe_payments_event_id_unique" ON "stripe_payments" USING btree ("stripe_event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "stripe_webhook_events_stripe_event_id_unique" ON "stripe_webhook_events" USING btree ("stripe_event_id");--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_current_job_id_processing_jobs_id_fk" FOREIGN KEY ("current_job_id") REFERENCES "public"."processing_jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE FUNCTION prevent_credit_ledger_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'credit ledger rows are immutable' USING ERRCODE = '55000';
  RETURN NULL;
END;
$$;--> statement-breakpoint
CREATE TRIGGER credit_ledger_immutable
BEFORE UPDATE OR DELETE ON credit_ledger
FOR EACH ROW
EXECUTE FUNCTION prevent_credit_ledger_mutation();--> statement-breakpoint
CREATE FUNCTION validate_project_current_job_ownership()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.current_job_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM processing_jobs
    WHERE id = NEW.current_job_id
      AND project_id = NEW.id
  ) THEN
    RAISE EXCEPTION 'current job must belong to its project' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER projects_current_job_owner_check
BEFORE INSERT OR UPDATE OF current_job_id ON projects
FOR EACH ROW
EXECUTE FUNCTION validate_project_current_job_ownership();
