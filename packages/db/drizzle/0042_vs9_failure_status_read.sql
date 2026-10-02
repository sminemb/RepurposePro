-- This immutable predicate exposes no job data and performs no financial mutation.
-- Runtime uses it only to describe the authoritative pending failure intent.
GRANT EXECUTE ON FUNCTION public.is_processing_failure_refund_eligible(text)
TO repurposepro_runtime;

--> statement-breakpoint
-- A terminal worker clears its lease. NULL must be claimable, not excluded by NOT(NULL).
CREATE OR REPLACE FUNCTION public.claim_processing_failure_intent(
  p_sweeper_id text,
  p_job_id uuid DEFAULT NULL
)
RETURNS TABLE (
  attempt_count integer,
  failure_code text,
  intent_id uuid,
  job_id uuid,
  lease_token uuid,
  safe_message text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog, public, pg_temp
AS $$
BEGIN
  IF p_sweeper_id IS NULL OR p_sweeper_id = '' OR length(p_sweeper_id) > 200 THEN
    RAISE EXCEPTION 'failure sweeper identity is invalid' USING ERRCODE = '23514';
  END IF;

  RETURN QUERY
  WITH candidate AS (
    SELECT intent.id
    FROM public.processing_failure_intents AS intent
    JOIN public.processing_jobs AS job
      ON job.id = intent.processing_job_id
    WHERE intent.status = 'pending'
      AND intent.next_attempt_at <= now()
      AND (intent.lease_expires_at IS NULL OR intent.lease_expires_at <= now())
      AND (p_job_id IS NULL OR intent.processing_job_id = p_job_id)
      AND (job.status <> 'active' OR job.execution_lease_expires_at IS NULL
        OR job.execution_lease_expires_at <= clock_timestamp())
    ORDER BY intent.next_attempt_at, intent.created_at, intent.id
    FOR UPDATE OF intent SKIP LOCKED
    LIMIT 1
  ),
  claimed AS (
    UPDATE public.processing_failure_intents AS intent
    SET attempt_count = intent.attempt_count + 1,
        lease_token = gen_random_uuid(),
        lease_owner = p_sweeper_id,
        lease_expires_at = now() + interval '30 seconds',
        updated_at = now()
    FROM candidate
    WHERE intent.id = candidate.id
    RETURNING intent.*
  )
  SELECT
    claimed.attempt_count,
    claimed.failure_code,
    claimed.id,
    claimed.processing_job_id,
    claimed.lease_token,
    claimed.safe_message
  FROM claimed;
END;
$$;--> statement-breakpoint


--> statement-breakpoint
-- Preserve the first accepted durable reason even before job finalization.
CREATE OR REPLACE FUNCTION public.finalize_failed_processing_job(p_job_id uuid,p_failure_code text,p_error_message text)
RETURNS TABLE(outcome text,refunded_credits integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog,public,pg_temp AS $$
DECLARE j public.processing_jobs; uid text;
BEGIN
  IF p_job_id IS NULL OR p_failure_code IS NULL OR NOT public.is_processing_failure_code_supported(p_failure_code)
    OR p_error_message IS NULL OR length(p_error_message) NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'invalid terminal processing failure' USING ERRCODE='23514';
  END IF;
  SELECT user_id INTO uid FROM public.processing_jobs WHERE id=p_job_id;
  IF NOT FOUND THEN RETURN QUERY SELECT 'job_not_found',0; RETURN; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('credit-ledger:'||uid));
  PERFORM 1 FROM public.projects p JOIN public.processing_jobs j0 ON j0.project_id=p.id
    WHERE j0.id=p_job_id AND p.user_id=uid FOR UPDATE OF p;
  IF NOT FOUND THEN RAISE EXCEPTION 'processing refund ownership is invalid' USING ERRCODE='23514'; END IF;
  SELECT * INTO j FROM public.processing_jobs WHERE id=p_job_id FOR UPDATE;
  IF EXISTS(SELECT 1 FROM public.processing_failure_intents i WHERE i.processing_job_id=j.id
    AND i.failure_code IS DISTINCT FROM p_failure_code) THEN
    RETURN QUERY SELECT 'terminal_failure_conflict',0; RETURN;
  END IF;
  IF j.type<>'analyze_video' OR j.status IN ('completed','cancelled') THEN
    RETURN QUERY SELECT 'invalid_job_state',0; RETURN;
  END IF;
  IF j.status='refunded' AND j.refund_completed_at IS NOT NULL THEN
    IF j.error_code IS DISTINCT FROM p_failure_code OR j.refund_eligible IS DISTINCT FROM public.is_processing_failure_refund_eligible(p_failure_code) THEN
      RETURN QUERY SELECT 'terminal_failure_conflict',0; RETURN;
    END IF;
    IF j.credits_charged<=0 OR NOT EXISTS(SELECT 1 FROM public.credit_ledger l WHERE l.processing_job_id=j.id
      AND l.project_id=j.project_id AND l.user_id=j.user_id AND l.type='processing_deduction' AND l.amount=-j.credits_charged)
      OR NOT EXISTS(SELECT 1 FROM public.credit_ledger l WHERE l.processing_job_id=j.id AND l.project_id=j.project_id
        AND l.user_id=j.user_id AND l.type='refund' AND l.amount=j.credits_charged) THEN
      RAISE EXCEPTION 'historical refund requires exact ledger records' USING ERRCODE='23514';
    END IF;
    RETURN QUERY SELECT 'already_refunded',j.credits_charged; RETURN;
  END IF;
  IF j.status='active' AND j.execution_lease_expires_at>clock_timestamp() THEN
    RETURN QUERY SELECT 'lease_active',0; RETURN;
  END IF;
  IF public.is_analysis_preview_ready(j.id,j.project_id) THEN RETURN QUERY SELECT 'invalid_job_state',0; RETURN; END IF;
  RETURN QUERY SELECT r.outcome,r.refunded_credits FROM public.finalize_failed_processing_job_v1(p_job_id,p_failure_code,p_error_message) r;
END $$;
--> statement-breakpoint
