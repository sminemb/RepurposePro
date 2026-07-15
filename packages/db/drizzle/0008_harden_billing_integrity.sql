DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'repurposepro_owner') THEN
    CREATE ROLE repurposepro_owner NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'repurposepro_runtime') THEN
    CREATE ROLE repurposepro_runtime NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
END;
$$;--> statement-breakpoint

ALTER TYPE project_output_type OWNER TO repurposepro_owner;--> statement-breakpoint
ALTER TYPE project_status OWNER TO repurposepro_owner;--> statement-breakpoint
ALTER TYPE processing_job_type OWNER TO repurposepro_owner;--> statement-breakpoint
ALTER TYPE processing_job_status OWNER TO repurposepro_owner;--> statement-breakpoint
ALTER TYPE processing_step OWNER TO repurposepro_owner;--> statement-breakpoint
ALTER TYPE ledger_type OWNER TO repurposepro_owner;--> statement-breakpoint
ALTER TYPE stripe_payment_status OWNER TO repurposepro_owner;--> statement-breakpoint
ALTER TYPE stripe_webhook_event_status OWNER TO repurposepro_owner;--> statement-breakpoint

ALTER TABLE users OWNER TO repurposepro_owner;--> statement-breakpoint
ALTER TABLE sessions OWNER TO repurposepro_owner;--> statement-breakpoint
ALTER TABLE accounts OWNER TO repurposepro_owner;--> statement-breakpoint
ALTER TABLE verifications OWNER TO repurposepro_owner;--> statement-breakpoint
ALTER TABLE projects OWNER TO repurposepro_owner;--> statement-breakpoint
ALTER TABLE uploaded_videos OWNER TO repurposepro_owner;--> statement-breakpoint
ALTER TABLE processing_jobs OWNER TO repurposepro_owner;--> statement-breakpoint
ALTER TABLE credit_ledger OWNER TO repurposepro_owner;--> statement-breakpoint
ALTER TABLE stripe_customers OWNER TO repurposepro_owner;--> statement-breakpoint
ALTER TABLE stripe_payments OWNER TO repurposepro_owner;--> statement-breakpoint
ALTER TABLE stripe_webhook_events OWNER TO repurposepro_owner;--> statement-breakpoint

CREATE FUNCTION prevent_processing_job_charge_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.credits_charged IS DISTINCT FROM OLD.credits_charged THEN
    RAISE EXCEPTION 'processing job credit charge is immutable' USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$$;--> statement-breakpoint

CREATE TRIGGER processing_jobs_charge_immutable
BEFORE UPDATE OF credits_charged ON processing_jobs
FOR EACH ROW
EXECUTE FUNCTION prevent_processing_job_charge_mutation();--> statement-breakpoint

CREATE FUNCTION validate_credit_ledger_processing_charge()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  job_credits integer;
  deduction_amount integer;
  refund_allowed boolean;
  job_status processing_job_status;
BEGIN
  IF NEW.type = 'processing_deduction' THEN
    SELECT credits_charged
    INTO job_credits
    FROM processing_jobs
    WHERE id = NEW.processing_job_id
      AND project_id = NEW.project_id
      AND user_id = NEW.user_id;

    IF NOT FOUND OR job_credits <= 0 OR NEW.amount <> -job_credits THEN
      RAISE EXCEPTION 'processing deduction must equal the job credit charge'
        USING ERRCODE = '23514';
    END IF;
  ELSIF NEW.type = 'refund' THEN
    SELECT amount
    INTO deduction_amount
    FROM credit_ledger
    WHERE processing_job_id = NEW.processing_job_id
      AND project_id = NEW.project_id
      AND user_id = NEW.user_id
      AND type = 'processing_deduction';

    SELECT refund_eligible, status
    INTO refund_allowed, job_status
    FROM processing_jobs
    WHERE id = NEW.processing_job_id
      AND project_id = NEW.project_id
      AND user_id = NEW.user_id;

    IF NOT FOUND
      OR deduction_amount IS NULL
      OR NEW.amount <> -deduction_amount
      OR refund_allowed IS NOT TRUE
      OR job_status NOT IN ('failed', 'refunded') THEN
      RAISE EXCEPTION 'refund must exactly reverse an eligible failed job deduction'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;--> statement-breakpoint

CREATE TRIGGER credit_ledger_processing_charge_validation
BEFORE INSERT ON credit_ledger
FOR EACH ROW
EXECUTE FUNCTION validate_credit_ledger_processing_charge();--> statement-breakpoint

CREATE FUNCTION validate_stripe_payment_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Stripe payment rows are immutable' USING ERRCODE = '55000';
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.user_id IS DISTINCT FROM OLD.user_id
    OR NEW.stripe_customer_id IS DISTINCT FROM OLD.stripe_customer_id
    OR NEW.stripe_checkout_session_id IS DISTINCT FROM OLD.stripe_checkout_session_id
    OR NEW.stripe_payment_intent_id IS DISTINCT FROM OLD.stripe_payment_intent_id
    OR NEW.stripe_event_id IS DISTINCT FROM OLD.stripe_event_id
    OR NEW.pack_code IS DISTINCT FROM OLD.pack_code
    OR NEW.amount_cents IS DISTINCT FROM OLD.amount_cents
    OR NEW.currency IS DISTINCT FROM OLD.currency
    OR NEW.credits_granted IS DISTINCT FROM OLD.credits_granted
    OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Stripe payment identity and financial terms are immutable'
      USING ERRCODE = '55000';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status
    AND NOT (
      (OLD.status = 'pending' AND NEW.status IN ('paid', 'failed'))
      OR (OLD.status = 'paid' AND NEW.status = 'refunded')
    ) THEN
    RAISE EXCEPTION 'invalid Stripe payment status transition' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;--> statement-breakpoint

CREATE TRIGGER stripe_payments_immutable
BEFORE UPDATE OR DELETE ON stripe_payments
FOR EACH ROW
EXECUTE FUNCTION validate_stripe_payment_update();--> statement-breakpoint

CREATE FUNCTION prevent_stripe_customer_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Stripe customer rows are immutable' USING ERRCODE = '55000';
  RETURN NULL;
END;
$$;--> statement-breakpoint

CREATE TRIGGER stripe_customers_immutable
BEFORE UPDATE OR DELETE ON stripe_customers
FOR EACH ROW
EXECUTE FUNCTION prevent_stripe_customer_mutation();--> statement-breakpoint

CREATE FUNCTION validate_stripe_webhook_event_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Stripe webhook event rows are immutable' USING ERRCODE = '55000';
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.stripe_event_id IS DISTINCT FROM OLD.stripe_event_id
    OR NEW.event_type IS DISTINCT FROM OLD.event_type
    OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Stripe webhook event identity is immutable' USING ERRCODE = '55000';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status
    AND NOT (
      (OLD.status = 'received' AND NEW.status IN ('processed', 'failed', 'ignored'))
      OR (OLD.status = 'failed' AND NEW.status = 'processed')
    ) THEN
    RAISE EXCEPTION 'invalid Stripe webhook event status transition' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;--> statement-breakpoint

CREATE TRIGGER stripe_webhook_events_immutable
BEFORE UPDATE OR DELETE ON stripe_webhook_events
FOR EACH ROW
EXECUTE FUNCTION validate_stripe_webhook_event_update();--> statement-breakpoint

ALTER FUNCTION prevent_credit_ledger_mutation() OWNER TO repurposepro_owner;--> statement-breakpoint
ALTER FUNCTION validate_project_current_job_ownership() OWNER TO repurposepro_owner;--> statement-breakpoint
ALTER FUNCTION prevent_processing_job_ownership_change() OWNER TO repurposepro_owner;--> statement-breakpoint
ALTER FUNCTION validate_credit_ledger_purchase() OWNER TO repurposepro_owner;--> statement-breakpoint
ALTER FUNCTION prevent_processing_job_charge_mutation() OWNER TO repurposepro_owner;--> statement-breakpoint
ALTER FUNCTION validate_credit_ledger_processing_charge() OWNER TO repurposepro_owner;--> statement-breakpoint
ALTER FUNCTION validate_stripe_payment_update() OWNER TO repurposepro_owner;--> statement-breakpoint
ALTER FUNCTION prevent_stripe_customer_mutation() OWNER TO repurposepro_owner;--> statement-breakpoint
ALTER FUNCTION validate_stripe_webhook_event_update() OWNER TO repurposepro_owner;--> statement-breakpoint

ALTER TABLE credit_ledger ENABLE ALWAYS TRIGGER credit_ledger_immutable;--> statement-breakpoint
ALTER TABLE credit_ledger ENABLE ALWAYS TRIGGER credit_ledger_purchase_validation;--> statement-breakpoint
ALTER TABLE credit_ledger ENABLE ALWAYS TRIGGER credit_ledger_processing_charge_validation;--> statement-breakpoint
ALTER TABLE credit_ledger ENABLE ALWAYS TRIGGER credit_ledger_truncate_immutable;--> statement-breakpoint

REVOKE CREATE ON SCHEMA public FROM PUBLIC;--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO repurposepro_runtime;--> statement-breakpoint
REVOKE ALL ON TABLE credit_ledger FROM PUBLIC, repurposepro_runtime;--> statement-breakpoint
REVOKE ALL ON TABLE stripe_customers FROM PUBLIC, repurposepro_runtime;--> statement-breakpoint
REVOKE ALL ON TABLE stripe_payments FROM PUBLIC, repurposepro_runtime;--> statement-breakpoint
REVOKE ALL ON TABLE stripe_webhook_events FROM PUBLIC, repurposepro_runtime;--> statement-breakpoint
REVOKE ALL ON TABLE processing_jobs FROM PUBLIC, repurposepro_runtime;--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE users, sessions, accounts, verifications, projects, uploaded_videos TO repurposepro_runtime;--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE processing_jobs TO repurposepro_runtime;--> statement-breakpoint
GRANT UPDATE (status, step, progress, refund_eligible, refund_completed_at, attempt_count, bullmq_job_id, error_code, error_message, started_at, completed_at, updated_at) ON TABLE processing_jobs TO repurposepro_runtime;--> statement-breakpoint
GRANT SELECT ON TABLE credit_ledger, stripe_customers, stripe_payments, stripe_webhook_events TO repurposepro_runtime;--> statement-breakpoint

DO $$
BEGIN
  EXECUTE format('REVOKE CREATE, TEMPORARY ON DATABASE %I FROM repurposepro_runtime', current_database());
END;
$$;
