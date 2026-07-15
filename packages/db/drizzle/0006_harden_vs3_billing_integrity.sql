ALTER TABLE "processing_jobs" ADD CONSTRAINT "processing_jobs_id_project_id_user_id_unique" UNIQUE("id","project_id","user_id");--> statement-breakpoint
ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_job_project_owner_fk" FOREIGN KEY ("processing_job_id","project_id","user_id") REFERENCES "public"."processing_jobs"("id","project_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

CREATE FUNCTION prevent_processing_job_ownership_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.project_id IS DISTINCT FROM OLD.project_id OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'processing job ownership is immutable' USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$$;--> statement-breakpoint

CREATE TRIGGER processing_jobs_owner_immutable
BEFORE UPDATE OF project_id, user_id ON processing_jobs
FOR EACH ROW
EXECUTE FUNCTION prevent_processing_job_ownership_change();--> statement-breakpoint

CREATE FUNCTION validate_credit_ledger_purchase()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.type = 'purchase' AND NOT EXISTS (
    SELECT 1
    FROM stripe_payments
    WHERE id = NEW.stripe_payment_id
      AND user_id = NEW.user_id
      AND status = 'paid'
      AND credits_granted = NEW.amount
  ) THEN
    RAISE EXCEPTION 'purchase ledger entry must match a paid Stripe payment'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;--> statement-breakpoint

CREATE TRIGGER credit_ledger_purchase_validation
BEFORE INSERT ON credit_ledger
FOR EACH ROW
EXECUTE FUNCTION validate_credit_ledger_purchase();--> statement-breakpoint

CREATE TRIGGER credit_ledger_truncate_immutable
BEFORE TRUNCATE ON credit_ledger
FOR EACH STATEMENT
EXECUTE FUNCTION prevent_credit_ledger_mutation();
