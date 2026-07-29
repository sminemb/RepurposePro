CREATE TYPE public.processing_dispatch_status AS ENUM ('pending', 'published');--> statement-breakpoint

CREATE TABLE public.processing_job_dispatches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  processing_job_id uuid NOT NULL REFERENCES public.processing_jobs(id) ON DELETE CASCADE,
  status public.processing_dispatch_status NOT NULL DEFAULT 'pending',
  attempt_count integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  lease_token uuid,
  lease_owner text,
  lease_expires_at timestamptz,
  bullmq_job_id text,
  last_failure_stage text,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT processing_job_dispatches_attempt_count_check CHECK (attempt_count >= 0),
  CONSTRAINT processing_job_dispatches_lease_check CHECK (
    (lease_token IS NULL AND lease_owner IS NULL AND lease_expires_at IS NULL)
    OR (lease_token IS NOT NULL AND lease_owner IS NOT NULL AND lease_expires_at IS NOT NULL)
  ),
  CONSTRAINT processing_job_dispatches_published_check CHECK (
    (status = 'pending' AND published_at IS NULL)
    OR (
      status = 'published'
      AND published_at IS NOT NULL
      AND bullmq_job_id IS NOT NULL
    )
  )
);--> statement-breakpoint

CREATE UNIQUE INDEX processing_job_dispatches_processing_job_id_unique
  ON public.processing_job_dispatches (processing_job_id);--> statement-breakpoint
CREATE INDEX processing_job_dispatches_pending_idx
  ON public.processing_job_dispatches (status, next_attempt_at)
  WHERE status = 'pending';--> statement-breakpoint

CREATE FUNCTION public.create_paid_analysis_dispatch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog, public, pg_temp
AS $$
BEGIN
  IF NEW.type = 'analyze_video'
    AND NEW.status = 'queued'
    AND NEW.credits_charged > 0 THEN
    INSERT INTO public.processing_job_dispatches (processing_job_id)
    VALUES (NEW.id)
    ON CONFLICT (processing_job_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;--> statement-breakpoint

CREATE TRIGGER processing_jobs_create_paid_analysis_dispatch
AFTER INSERT ON public.processing_jobs
FOR EACH ROW
EXECUTE FUNCTION public.create_paid_analysis_dispatch();--> statement-breakpoint

INSERT INTO public.processing_job_dispatches (
  processing_job_id,
  status,
  bullmq_job_id,
  published_at
)
SELECT
  job.id,
  CASE
    WHEN job.bullmq_job_id IS NULL THEN 'pending'::public.processing_dispatch_status
    ELSE 'published'::public.processing_dispatch_status
  END,
  job.bullmq_job_id,
  CASE WHEN job.bullmq_job_id IS NULL THEN NULL ELSE now() END
FROM public.processing_jobs AS job
WHERE job.type = 'analyze_video'
  AND job.status IN ('queued', 'active')
  AND job.credits_charged > 0
  AND EXISTS (
    SELECT 1
    FROM public.credit_ledger AS deduction
    WHERE deduction.processing_job_id = job.id
      AND deduction.project_id = job.project_id
      AND deduction.user_id = job.user_id
      AND deduction.type = 'processing_deduction'
      AND deduction.amount = -job.credits_charged
  )
ON CONFLICT (processing_job_id) DO NOTHING;--> statement-breakpoint

CREATE FUNCTION public.claim_pending_analysis_dispatch(
  p_dispatcher_id text,
  p_job_id uuid DEFAULT NULL
)
RETURNS TABLE (
  attempt_count integer,
  dispatch_id uuid,
  job_id uuid,
  job_status public.processing_job_status,
  lease_token uuid,
  project_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog, public, pg_temp
AS $$
BEGIN
  IF p_dispatcher_id IS NULL OR p_dispatcher_id = '' THEN
    RAISE EXCEPTION 'dispatcher identity is required' USING ERRCODE = '23514';
  END IF;

  RETURN QUERY
  WITH candidate AS (
    SELECT dispatch.id
    FROM public.processing_job_dispatches AS dispatch
    JOIN public.processing_jobs AS job
      ON job.id = dispatch.processing_job_id
    WHERE dispatch.status = 'pending'
      AND dispatch.next_attempt_at <= now()
      AND (dispatch.lease_expires_at IS NULL OR dispatch.lease_expires_at <= now())
      AND (p_job_id IS NULL OR job.id = p_job_id)
      AND job.type = 'analyze_video'
      AND job.status IN ('queued', 'active')
      AND job.credits_charged > 0
      AND EXISTS (
        SELECT 1
        FROM public.credit_ledger AS deduction
        WHERE deduction.processing_job_id = job.id
          AND deduction.project_id = job.project_id
          AND deduction.user_id = job.user_id
          AND deduction.type = 'processing_deduction'
          AND deduction.amount = -job.credits_charged
      )
    ORDER BY dispatch.next_attempt_at, dispatch.created_at, dispatch.id
    FOR UPDATE OF dispatch SKIP LOCKED
    LIMIT 1
  ),
  claimed AS (
    UPDATE public.processing_job_dispatches AS dispatch
    SET attempt_count = dispatch.attempt_count + 1,
        lease_token = gen_random_uuid(),
        lease_owner = p_dispatcher_id,
        lease_expires_at = now() + interval '30 seconds',
        updated_at = now()
    FROM candidate
    WHERE dispatch.id = candidate.id
    RETURNING
      dispatch.attempt_count,
      dispatch.id,
      dispatch.processing_job_id,
      dispatch.lease_token
  )
  SELECT
    claimed.attempt_count,
    claimed.id,
    job.id,
    job.status,
    claimed.lease_token,
    job.project_id
  FROM claimed
  JOIN public.processing_jobs AS job
    ON job.id = claimed.processing_job_id;
END;
$$;--> statement-breakpoint

CREATE FUNCTION public.is_analysis_dispatch_published(p_job_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO pg_catalog, public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.processing_job_dispatches AS dispatch
    JOIN public.processing_jobs AS job
      ON job.id = dispatch.processing_job_id
    WHERE job.id = p_job_id
      AND job.type = 'analyze_video'
      AND dispatch.status = 'published'
      AND dispatch.bullmq_job_id = job.id::text
  );
$$;--> statement-breakpoint

CREATE FUNCTION public.mark_analysis_dispatch_published(
  p_dispatch_id uuid,
  p_lease_token uuid,
  p_bullmq_job_id text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog, public, pg_temp
AS $$
DECLARE
  v_job_id uuid;
BEGIN
  IF p_dispatch_id IS NULL
    OR p_lease_token IS NULL
    OR p_bullmq_job_id IS NULL
    OR p_bullmq_job_id = '' THEN
    RAISE EXCEPTION 'dispatch publication identity is required' USING ERRCODE = '23514';
  END IF;

  SELECT processing_job_id
  INTO v_job_id
  FROM public.processing_job_dispatches
  WHERE id = p_dispatch_id
    AND status = 'pending'
    AND lease_token = p_lease_token
  FOR UPDATE;

  IF NOT FOUND OR v_job_id::text <> p_bullmq_job_id THEN
    RAISE EXCEPTION 'dispatch lease is no longer publishable' USING ERRCODE = '23514';
  END IF;

  UPDATE public.processing_job_dispatches
  SET status = 'published',
      bullmq_job_id = p_bullmq_job_id,
      published_at = now(),
      lease_token = NULL,
      lease_owner = NULL,
      lease_expires_at = NULL,
      last_failure_stage = NULL,
      updated_at = now()
  WHERE id = p_dispatch_id;

  UPDATE public.processing_jobs
  SET bullmq_job_id = p_bullmq_job_id,
      updated_at = now()
  WHERE id = v_job_id
    AND type = 'analyze_video'
    AND (bullmq_job_id IS NULL OR bullmq_job_id = p_bullmq_job_id);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'processing queue reference did not update one job'
      USING ERRCODE = '23514';
  END IF;

  RETURN 'published';
END;
$$;--> statement-breakpoint

CREATE FUNCTION public.reschedule_analysis_dispatch(
  p_dispatch_id uuid,
  p_lease_token uuid,
  p_failure_stage text,
  p_delay_seconds integer
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog, public, pg_temp
AS $$
BEGIN
  IF p_dispatch_id IS NULL
    OR p_lease_token IS NULL
    OR p_failure_stage NOT IN ('active_job_missing', 'queue_publish', 'queue_reference_persist')
    OR p_delay_seconds < 1
    OR p_delay_seconds > 300 THEN
    RAISE EXCEPTION 'dispatch retry input is invalid' USING ERRCODE = '23514';
  END IF;

  UPDATE public.processing_job_dispatches
  SET next_attempt_at = now() + make_interval(secs => p_delay_seconds),
      lease_token = NULL,
      lease_owner = NULL,
      lease_expires_at = NULL,
      last_failure_stage = p_failure_stage,
      updated_at = now()
  WHERE id = p_dispatch_id
    AND status = 'pending'
    AND lease_token = p_lease_token;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'dispatch lease is no longer retryable' USING ERRCODE = '23514';
  END IF;

  RETURN 'rescheduled';
END;
$$;--> statement-breakpoint

CREATE FUNCTION public.is_processing_failure_refund_eligible(p_failure_code text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO pg_catalog, public, pg_temp
AS $$
  SELECT p_failure_code IN (
    'ANALYSIS_RETRIES_EXHAUSTED',
    'AUDIO_EXTRACTION_FAILED',
    'FFMPEG_FAILED',
    'GEMINI_FAILED',
    'INVALID_AI_OUTPUT',
    'STORAGE_FAILED',
    'WHISPER_FAILED',
    'WORKER_PERMANENT_FAILURE'
  );
$$;--> statement-breakpoint

CREATE FUNCTION public.finalize_failed_processing_job(
  p_job_id uuid,
  p_failure_code text,
  p_error_message text
)
RETURNS TABLE (
  outcome text,
  refunded_credits integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog, public, pg_temp
AS $$
DECLARE
  v_deduction_amount integer;
  v_job public.processing_jobs%ROWTYPE;
  v_refund_amount integer;
  v_refund_eligible boolean;
BEGIN
  IF p_job_id IS NULL
    OR p_failure_code IS NULL
    OR p_failure_code = ''
    OR p_error_message IS NULL
    OR p_error_message = ''
    OR length(p_error_message) > 500 THEN
    RAISE EXCEPTION 'terminal processing failure input is invalid' USING ERRCODE = '23514';
  END IF;

  SELECT *
  INTO v_job
  FROM public.processing_jobs AS job
  WHERE job.id = p_job_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'job_not_found', 0;
    RETURN;
  END IF;

  PERFORM 1
  FROM public.projects AS project
  WHERE project.id = v_job.project_id
    AND project.user_id = v_job.user_id
    AND project.current_job_id = v_job.id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'processing refund project ownership is invalid'
      USING ERRCODE = '23514';
  END IF;

  SELECT deduction.amount
  INTO v_deduction_amount
  FROM public.credit_ledger AS deduction
  WHERE deduction.processing_job_id = v_job.id
    AND deduction.project_id = v_job.project_id
    AND deduction.user_id = v_job.user_id
    AND deduction.type = 'processing_deduction'
  FOR UPDATE;

  IF v_job.credits_charged <= 0
    OR NOT FOUND
    OR v_deduction_amount <> -v_job.credits_charged THEN
    RAISE EXCEPTION 'processing refund requires one exact immutable deduction'
      USING ERRCODE = '23514';
  END IF;

  IF v_job.status = 'refunded' AND v_job.refund_completed_at IS NOT NULL THEN
    SELECT refund.amount
    INTO v_refund_amount
    FROM public.credit_ledger AS refund
    WHERE refund.processing_job_id = v_job.id
      AND refund.project_id = v_job.project_id
      AND refund.user_id = v_job.user_id
      AND refund.type = 'refund'
    FOR UPDATE;

    IF NOT FOUND OR v_refund_amount <> v_job.credits_charged THEN
      RAISE EXCEPTION 'refunded processing job has no exact immutable refund'
        USING ERRCODE = '23514';
    END IF;

    RETURN QUERY SELECT 'already_refunded', v_job.credits_charged;
    RETURN;
  END IF;

  IF v_job.status NOT IN ('queued', 'active', 'failed') THEN
    RETURN QUERY SELECT 'invalid_job_state', 0;
    RETURN;
  END IF;

  SELECT public.is_processing_failure_refund_eligible(p_failure_code)
  INTO v_refund_eligible;

  UPDATE public.processing_jobs
  SET status = 'failed',
      step = 'failed',
      progress = NULL,
      refund_eligible = v_refund_eligible,
      error_code = p_failure_code,
      error_message = p_error_message,
      completed_at = COALESCE(completed_at, now()),
      updated_at = now()
  WHERE id = v_job.id;

  IF NOT v_refund_eligible THEN
    UPDATE public.projects
    SET status = 'failed', updated_at = now()
    WHERE id = v_job.project_id
      AND user_id = v_job.user_id
      AND current_job_id = v_job.id;

    RETURN QUERY SELECT 'failed_no_refund', 0;
    RETURN;
  END IF;

  INSERT INTO public.credit_ledger (
    user_id,
    type,
    amount,
    project_id,
    processing_job_id,
    description,
    idempotency_key
  )
  VALUES (
    v_job.user_id,
    'refund',
    v_job.credits_charged,
    v_job.project_id,
    v_job.id,
    'Automatic refund for failed processing',
    'processing-refund:' || v_job.id::text
  )
  ON CONFLICT (processing_job_id) WHERE type = 'refund' DO NOTHING;

  SELECT refund.amount
  INTO v_refund_amount
  FROM public.credit_ledger AS refund
  WHERE refund.processing_job_id = v_job.id
    AND refund.project_id = v_job.project_id
    AND refund.user_id = v_job.user_id
    AND refund.type = 'refund'
  FOR UPDATE;

  IF NOT FOUND OR v_refund_amount <> v_job.credits_charged THEN
    RAISE EXCEPTION 'processing refund was not persisted exactly once'
      USING ERRCODE = '23514';
  END IF;

  UPDATE public.processing_jobs
  SET status = 'refunded',
      refund_completed_at = COALESCE(refund_completed_at, now()),
      updated_at = now()
  WHERE id = v_job.id;

  UPDATE public.projects
  SET status = 'refunded', updated_at = now()
  WHERE id = v_job.project_id
    AND user_id = v_job.user_id
    AND current_job_id = v_job.id;

  RETURN QUERY SELECT 'refunded', v_job.credits_charged;
END;
$$;--> statement-breakpoint

ALTER FUNCTION public.create_paid_analysis_dispatch()
  OWNER TO repurposepro_owner;--> statement-breakpoint
ALTER FUNCTION public.claim_pending_analysis_dispatch(text, uuid)
  OWNER TO repurposepro_owner;--> statement-breakpoint
ALTER FUNCTION public.is_analysis_dispatch_published(uuid)
  OWNER TO repurposepro_owner;--> statement-breakpoint
ALTER FUNCTION public.mark_analysis_dispatch_published(uuid, uuid, text)
  OWNER TO repurposepro_owner;--> statement-breakpoint
ALTER FUNCTION public.reschedule_analysis_dispatch(uuid, uuid, text, integer)
  OWNER TO repurposepro_owner;--> statement-breakpoint
ALTER FUNCTION public.is_processing_failure_refund_eligible(text)
  OWNER TO repurposepro_owner;--> statement-breakpoint
ALTER FUNCTION public.finalize_failed_processing_job(uuid, text, text)
  OWNER TO repurposepro_owner;--> statement-breakpoint

REVOKE ALL ON TABLE public.processing_job_dispatches
  FROM PUBLIC, repurposepro_runtime, repurposepro_checkout, repurposepro_webhook, repurposepro_processing;--> statement-breakpoint

REVOKE ALL ON FUNCTION public.create_paid_analysis_dispatch()
  FROM PUBLIC, repurposepro_runtime, repurposepro_checkout, repurposepro_webhook, repurposepro_processing;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.mark_paid_analysis_enqueued(text, uuid, uuid, text)
  FROM PUBLIC, repurposepro_runtime, repurposepro_checkout, repurposepro_webhook, repurposepro_processing;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.claim_pending_analysis_dispatch(text, uuid)
  FROM PUBLIC, repurposepro_runtime, repurposepro_checkout, repurposepro_webhook;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.is_analysis_dispatch_published(uuid)
  FROM PUBLIC, repurposepro_runtime, repurposepro_checkout, repurposepro_webhook;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.mark_analysis_dispatch_published(uuid, uuid, text)
  FROM PUBLIC, repurposepro_runtime, repurposepro_checkout, repurposepro_webhook;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.reschedule_analysis_dispatch(uuid, uuid, text, integer)
  FROM PUBLIC, repurposepro_runtime, repurposepro_checkout, repurposepro_webhook;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.is_processing_failure_refund_eligible(text)
  FROM PUBLIC, repurposepro_runtime, repurposepro_checkout, repurposepro_webhook, repurposepro_processing;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.finalize_failed_processing_job(uuid, text, text)
  FROM PUBLIC, repurposepro_runtime, repurposepro_checkout, repurposepro_webhook;--> statement-breakpoint

GRANT EXECUTE ON FUNCTION public.claim_pending_analysis_dispatch(text, uuid)
  TO repurposepro_processing;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.is_analysis_dispatch_published(uuid)
  TO repurposepro_processing;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.mark_analysis_dispatch_published(uuid, uuid, text)
  TO repurposepro_processing;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.reschedule_analysis_dispatch(uuid, uuid, text, integer)
  TO repurposepro_processing;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.finalize_failed_processing_job(uuid, text, text)
  TO repurposepro_processing;
