ALTER TYPE public.stripe_webhook_event_status
  RENAME TO stripe_webhook_event_status_v1;--> statement-breakpoint
CREATE TYPE public.stripe_webhook_event_status AS ENUM (
  'received',
  'processing',
  'processed',
  'failed',
  'ignored'
);--> statement-breakpoint
ALTER TABLE public.stripe_webhook_events
  ALTER COLUMN status DROP DEFAULT;--> statement-breakpoint
ALTER TABLE public.stripe_webhook_events
  ALTER COLUMN status TYPE public.stripe_webhook_event_status
  USING status::text::public.stripe_webhook_event_status;--> statement-breakpoint
ALTER TABLE public.stripe_webhook_events
  ALTER COLUMN status SET DEFAULT 'received';--> statement-breakpoint
DROP TYPE public.stripe_webhook_event_status_v1;--> statement-breakpoint

ALTER TABLE public.stripe_webhook_events
  ADD COLUMN attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN last_attempt_at timestamptz,
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now(),
  ADD CONSTRAINT stripe_webhook_events_attempt_count_check CHECK (attempt_count >= 0);--> statement-breakpoint

ALTER TABLE public.processing_jobs
  ADD COLUMN execution_lease_token uuid,
  ADD COLUMN execution_lease_owner text,
  ADD COLUMN execution_lease_expires_at timestamptz,
  ADD COLUMN execution_heartbeat_at timestamptz,
  ADD CONSTRAINT processing_jobs_execution_lease_check CHECK (
    (
      execution_lease_token IS NULL
      AND execution_lease_owner IS NULL
      AND execution_lease_expires_at IS NULL
      AND execution_heartbeat_at IS NULL
    )
    OR (
      execution_lease_token IS NOT NULL
      AND execution_lease_owner IS NOT NULL
      AND execution_lease_expires_at IS NOT NULL
      AND execution_heartbeat_at IS NOT NULL
    )
  );--> statement-breakpoint

CREATE TYPE public.processing_failure_intent_status AS ENUM ('pending', 'finalized');--> statement-breakpoint

CREATE TABLE public.processing_failure_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  processing_job_id uuid NOT NULL REFERENCES public.processing_jobs(id) ON DELETE CASCADE,
  failure_code text NOT NULL,
  safe_message text NOT NULL,
  source_reference text NOT NULL,
  status public.processing_failure_intent_status NOT NULL DEFAULT 'pending',
  attempt_count integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  lease_token uuid,
  lease_owner text,
  lease_expires_at timestamptz,
  finalized_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT processing_failure_intents_attempt_count_check CHECK (attempt_count >= 0),
  CONSTRAINT processing_failure_intents_failure_code_check CHECK (
    failure_code <> '' AND length(failure_code) <= 100
  ),
  CONSTRAINT processing_failure_intents_safe_message_check CHECK (
    safe_message <> '' AND length(safe_message) <= 500
  ),
  CONSTRAINT processing_failure_intents_source_reference_check CHECK (
    source_reference <> '' AND length(source_reference) <= 200
  ),
  CONSTRAINT processing_failure_intents_lease_check CHECK (
    (lease_token IS NULL AND lease_owner IS NULL AND lease_expires_at IS NULL)
    OR (lease_token IS NOT NULL AND lease_owner IS NOT NULL AND lease_expires_at IS NOT NULL)
  ),
  CONSTRAINT processing_failure_intents_finalized_check CHECK (
    (status = 'pending' AND finalized_at IS NULL)
    OR (status = 'finalized' AND finalized_at IS NOT NULL)
  )
);--> statement-breakpoint

CREATE UNIQUE INDEX processing_failure_intents_processing_job_id_unique
  ON public.processing_failure_intents (processing_job_id);--> statement-breakpoint
CREATE INDEX processing_failure_intents_pending_idx
  ON public.processing_failure_intents (status, next_attempt_at)
  WHERE status = 'pending';--> statement-breakpoint

CREATE FUNCTION public.is_processing_failure_code_supported(p_failure_code text)
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
    'USER_CANCELLED',
    'WHISPER_FAILED',
    'WORKER_EXECUTION_LEASE_EXPIRED',
    'WORKER_PERMANENT_FAILURE'
  );
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.is_processing_failure_refund_eligible(p_failure_code text)
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
    'WORKER_EXECUTION_LEASE_EXPIRED',
    'WORKER_PERMANENT_FAILURE'
  );
$$;--> statement-breakpoint

CREATE FUNCTION public.preserve_terminal_processing_failure()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog, public, pg_temp
AS $$
BEGIN
  IF OLD.status IN ('failed', 'refunded')
    AND (
      NEW.error_code IS DISTINCT FROM OLD.error_code
      OR NEW.error_message IS DISTINCT FROM OLD.error_message
      OR NEW.refund_eligible IS DISTINCT FROM OLD.refund_eligible
    ) THEN
    RAISE EXCEPTION 'terminal processing failure reason is immutable'
      USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$$;--> statement-breakpoint

CREATE TRIGGER processing_jobs_preserve_terminal_failure
BEFORE UPDATE ON public.processing_jobs
FOR EACH ROW
EXECUTE FUNCTION public.preserve_terminal_processing_failure();--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.finalize_failed_processing_job(
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
    OR NOT public.is_processing_failure_code_supported(p_failure_code)
    OR p_error_message IS NULL
    OR p_error_message = ''
    OR length(p_error_message) > 500 THEN
    RAISE EXCEPTION 'terminal processing failure input is invalid' USING ERRCODE = '23514';
  END IF;

  SELECT public.is_processing_failure_refund_eligible(p_failure_code)
  INTO v_refund_eligible;

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

  IF v_job.status IN ('failed', 'refunded')
    AND (
      v_job.error_code IS DISTINCT FROM p_failure_code
      OR v_job.refund_eligible IS DISTINCT FROM v_refund_eligible
    ) THEN
    RETURN QUERY SELECT 'terminal_failure_conflict', 0;
    RETURN;
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

  IF v_job.status = 'failed' AND NOT v_refund_eligible THEN
    RETURN QUERY SELECT 'failed_no_refund', 0;
    RETURN;
  END IF;

  IF v_job.status NOT IN ('queued', 'active', 'failed') THEN
    RETURN QUERY SELECT 'invalid_job_state', 0;
    RETURN;
  END IF;

  IF v_job.status IN ('queued', 'active') THEN
    UPDATE public.processing_jobs
    SET status = 'failed',
        step = 'failed',
        progress = NULL,
        refund_eligible = v_refund_eligible,
        error_code = p_failure_code,
        error_message = p_error_message,
        completed_at = COALESCE(completed_at, now()),
        execution_lease_token = NULL,
        execution_lease_owner = NULL,
        execution_lease_expires_at = NULL,
        execution_heartbeat_at = NULL,
        updated_at = now()
    WHERE id = v_job.id;
  END IF;

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

CREATE FUNCTION public.persist_processing_failure_intent(
  p_job_id uuid,
  p_failure_code text,
  p_safe_message text,
  p_source_reference text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog, public, pg_temp
AS $$
DECLARE
  v_existing public.processing_failure_intents%ROWTYPE;
  v_inserted integer;
BEGIN
  IF p_job_id IS NULL
    OR NOT public.is_processing_failure_code_supported(p_failure_code)
    OR p_safe_message IS NULL
    OR p_safe_message = ''
    OR length(p_safe_message) > 500
    OR p_source_reference IS NULL
    OR p_source_reference = ''
    OR length(p_source_reference) > 200 THEN
    RAISE EXCEPTION 'processing failure intent input is invalid' USING ERRCODE = '23514';
  END IF;

  PERFORM 1
  FROM public.processing_jobs
  WHERE id = p_job_id
    AND type = 'analyze_video'
    AND status IN ('queued', 'active', 'failed', 'refunded')
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 'conflict';
  END IF;

  INSERT INTO public.processing_failure_intents (
    processing_job_id,
    failure_code,
    safe_message,
    source_reference
  )
  VALUES (p_job_id, p_failure_code, p_safe_message, p_source_reference)
  ON CONFLICT (processing_job_id) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  IF v_inserted > 0 THEN
    RETURN 'persisted';
  END IF;

  SELECT *
  INTO v_existing
  FROM public.processing_failure_intents
  WHERE processing_job_id = p_job_id
  FOR UPDATE;

  IF v_existing.failure_code IS DISTINCT FROM p_failure_code THEN
    RETURN 'conflict';
  END IF;

  IF v_existing.status = 'finalized' THEN
    RETURN 'finalized';
  END IF;

  RETURN 'duplicate';
END;
$$;--> statement-breakpoint

CREATE FUNCTION public.claim_processing_failure_intent(
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
    WHERE intent.status = 'pending'
      AND intent.next_attempt_at <= now()
      AND (intent.lease_expires_at IS NULL OR intent.lease_expires_at <= now())
      AND (p_job_id IS NULL OR intent.processing_job_id = p_job_id)
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

CREATE FUNCTION public.mark_processing_failure_intent_finalized(
  p_intent_id uuid,
  p_lease_token uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog, public, pg_temp
AS $$
BEGIN
  IF p_intent_id IS NULL OR p_lease_token IS NULL THEN
    RAISE EXCEPTION 'failure intent marker identity is required' USING ERRCODE = '23514';
  END IF;

  UPDATE public.processing_failure_intents
  SET status = 'finalized',
      finalized_at = now(),
      lease_token = NULL,
      lease_owner = NULL,
      lease_expires_at = NULL,
      updated_at = now()
  WHERE id = p_intent_id
    AND status = 'pending'
    AND lease_token = p_lease_token;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'failure intent lease is no longer finalizable' USING ERRCODE = '23514';
  END IF;

  RETURN 'finalized';
END;
$$;--> statement-breakpoint

CREATE FUNCTION public.reschedule_processing_failure_intent(
  p_intent_id uuid,
  p_lease_token uuid,
  p_delay_seconds integer
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog, public, pg_temp
AS $$
BEGIN
  IF p_intent_id IS NULL
    OR p_lease_token IS NULL
    OR p_delay_seconds < 1
    OR p_delay_seconds > 300 THEN
    RAISE EXCEPTION 'failure intent retry input is invalid' USING ERRCODE = '23514';
  END IF;

  UPDATE public.processing_failure_intents
  SET next_attempt_at = now() + make_interval(secs => p_delay_seconds),
      lease_token = NULL,
      lease_owner = NULL,
      lease_expires_at = NULL,
      updated_at = now()
  WHERE id = p_intent_id
    AND status = 'pending'
    AND lease_token = p_lease_token;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'failure intent lease is no longer retryable' USING ERRCODE = '23514';
  END IF;

  RETURN 'rescheduled';
END;
$$;--> statement-breakpoint

CREATE FUNCTION public.touch_analysis_execution_lease(
  p_job_id uuid,
  p_lease_owner text,
  p_lease_seconds integer
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog, public, pg_temp
AS $$
BEGIN
  IF p_job_id IS NULL
    OR p_lease_owner IS NULL
    OR p_lease_owner = ''
    OR length(p_lease_owner) > 200
    OR p_lease_seconds < 15
    OR p_lease_seconds > 300 THEN
    RAISE EXCEPTION 'execution lease input is invalid' USING ERRCODE = '23514';
  END IF;

  UPDATE public.processing_jobs
  SET execution_lease_token = COALESCE(execution_lease_token, gen_random_uuid()),
      execution_lease_owner = p_lease_owner,
      execution_lease_expires_at = now() + make_interval(secs => p_lease_seconds),
      execution_heartbeat_at = now(),
      updated_at = now()
  WHERE id = p_job_id
    AND type = 'analyze_video'
    AND status = 'active';

  RETURN CASE WHEN FOUND THEN 'renewed' ELSE 'ignored' END;
END;
$$;--> statement-breakpoint

DROP FUNCTION public.claim_pending_analysis_dispatch(text, uuid);--> statement-breakpoint

CREATE FUNCTION public.claim_pending_analysis_dispatch(
  p_dispatcher_id text,
  p_job_id uuid DEFAULT NULL
)
RETURNS TABLE (
  attempt_count integer,
  dispatch_id uuid,
  dispatch_status public.processing_dispatch_status,
  execution_lease_expires_at timestamptz,
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
  IF p_dispatcher_id IS NULL OR p_dispatcher_id = '' OR length(p_dispatcher_id) > 200 THEN
    RAISE EXCEPTION 'dispatcher identity is required' USING ERRCODE = '23514';
  END IF;

  RETURN QUERY
  WITH candidate AS (
    SELECT dispatch.id
    FROM public.processing_job_dispatches AS dispatch
    JOIN public.processing_jobs AS job
      ON job.id = dispatch.processing_job_id
    WHERE dispatch.status IN ('pending', 'published')
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
    ORDER BY
      CASE WHEN dispatch.status = 'pending' THEN 0 ELSE 1 END,
      dispatch.next_attempt_at,
      dispatch.created_at,
      dispatch.id
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
    RETURNING dispatch.*
  )
  SELECT
    claimed.attempt_count,
    claimed.id,
    claimed.status,
    job.execution_lease_expires_at,
    job.id,
    job.status,
    claimed.lease_token,
    job.project_id
  FROM claimed
  JOIN public.processing_jobs AS job
    ON job.id = claimed.processing_job_id;
END;
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.mark_analysis_dispatch_published(
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
    AND status IN ('pending', 'published')
    AND lease_token = p_lease_token
  FOR UPDATE;

  IF NOT FOUND OR v_job_id::text <> p_bullmq_job_id THEN
    RAISE EXCEPTION 'dispatch lease is no longer publishable' USING ERRCODE = '23514';
  END IF;

  UPDATE public.processing_job_dispatches
  SET status = 'published',
      bullmq_job_id = p_bullmq_job_id,
      published_at = COALESCE(published_at, now()),
      next_attempt_at = now() + interval '5 seconds',
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

CREATE OR REPLACE FUNCTION public.reschedule_analysis_dispatch(
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
    AND status IN ('pending', 'published')
    AND lease_token = p_lease_token;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'dispatch lease is no longer retryable' USING ERRCODE = '23514';
  END IF;

  RETURN 'rescheduled';
END;
$$;--> statement-breakpoint

UPDATE public.processing_job_dispatches AS dispatch
SET next_attempt_at = now(),
    updated_at = now()
FROM public.processing_jobs AS job
WHERE job.id = dispatch.processing_job_id
  AND dispatch.status = 'published'
  AND job.type = 'analyze_video'
  AND job.status = 'queued'
  AND job.credits_charged > 0;--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.validate_stripe_webhook_event_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog, public, pg_temp
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
      (OLD.status = 'received' AND NEW.status IN ('processing', 'failed', 'ignored'))
      OR (OLD.status = 'processing' AND NEW.status IN ('processed', 'failed', 'ignored'))
      OR (OLD.status = 'failed' AND NEW.status IN ('processing', 'failed', 'ignored'))
    ) THEN
    RAISE EXCEPTION 'invalid Stripe webhook event status transition' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;--> statement-breakpoint

CREATE FUNCTION public.receive_stripe_webhook_event(
  p_stripe_event_id text,
  p_event_type text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog, public, pg_temp
AS $$
DECLARE
  v_event public.stripe_webhook_events%ROWTYPE;
BEGIN
  IF p_stripe_event_id IS NULL
    OR p_stripe_event_id = ''
    OR length(p_stripe_event_id) > 255
    OR p_event_type IS NULL
    OR p_event_type = ''
    OR length(p_event_type) > 255 THEN
    RAISE EXCEPTION 'Stripe webhook receipt identity is invalid' USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.stripe_webhook_events (stripe_event_id, event_type)
  VALUES (p_stripe_event_id, p_event_type)
  ON CONFLICT (stripe_event_id) DO NOTHING;

  SELECT *
  INTO v_event
  FROM public.stripe_webhook_events
  WHERE stripe_event_id = p_stripe_event_id
  FOR UPDATE;

  IF v_event.event_type IS DISTINCT FROM p_event_type THEN
    RAISE EXCEPTION 'Stripe webhook receipt type conflicts with existing identity'
      USING ERRCODE = '23514';
  END IF;

  RETURN v_event.status::text;
END;
$$;--> statement-breakpoint

CREATE FUNCTION public.mark_stripe_webhook_event_failed(
  p_stripe_event_id text,
  p_event_type text,
  p_failure_classification text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog, public, pg_temp
AS $$
DECLARE
  v_event public.stripe_webhook_events%ROWTYPE;
BEGIN
  IF p_stripe_event_id IS NULL
    OR p_stripe_event_id = ''
    OR p_event_type IS NULL
    OR p_event_type = ''
    OR p_failure_classification NOT IN (
      'STRIPE_CHECKOUT_EXPIRATION_FAILED',
      'STRIPE_CHECKOUT_RETRIEVAL_FAILED',
      'STRIPE_PURCHASE_CORRELATION_FAILED',
      'STRIPE_PURCHASE_PROCESSING_FAILED'
    ) THEN
    RAISE EXCEPTION 'Stripe webhook failure input is invalid' USING ERRCODE = '23514';
  END IF;

  SELECT *
  INTO v_event
  FROM public.stripe_webhook_events
  WHERE stripe_event_id = p_stripe_event_id
    AND event_type = p_event_type
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Stripe webhook receipt is required before failure'
      USING ERRCODE = '23514';
  END IF;

  IF v_event.status IN ('processed', 'ignored') THEN
    RETURN v_event.status::text;
  END IF;

  UPDATE public.stripe_webhook_events
  SET status = 'failed',
      error_message = p_failure_classification,
      processed_at = NULL,
      updated_at = now()
  WHERE id = v_event.id;

  RETURN 'failed';
END;
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.record_stripe_webhook_ignored(
  p_stripe_event_id text,
  p_event_type text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog, public, pg_temp
AS $$
DECLARE
  v_event public.stripe_webhook_events%ROWTYPE;
BEGIN
  SELECT *
  INTO v_event
  FROM public.stripe_webhook_events
  WHERE stripe_event_id = p_stripe_event_id
    AND event_type = p_event_type
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Stripe webhook receipt is required before ignore'
      USING ERRCODE = '23514';
  END IF;

  IF v_event.status IN ('processed', 'ignored') THEN
    RETURN 'duplicate_event';
  END IF;

  UPDATE public.stripe_webhook_events
  SET status = 'ignored',
      processed_at = now(),
      error_message = NULL,
      updated_at = now()
  WHERE id = v_event.id;

  RETURN 'ignored';
END;
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.grant_stripe_credit_purchase(
  p_stripe_event_id text,
  p_event_type text,
  p_user_id text,
  p_checkout_session_id text,
  p_payment_intent_id text,
  p_price_id text,
  p_quantity integer,
  p_amount_cents integer,
  p_currency text,
  p_livemode boolean,
  p_mode text,
  p_payment_status text,
  p_session_status text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog, public, pg_temp
AS $$
DECLARE
  v_attempt public.stripe_checkout_sessions%ROWTYPE;
  v_event public.stripe_webhook_events%ROWTYPE;
  v_existing_payment public.stripe_payments%ROWTYPE;
  v_payment_id uuid;
BEGIN
  IF p_stripe_event_id IS NULL
    OR p_stripe_event_id = ''
    OR p_event_type <> 'checkout.session.completed'
    OR p_user_id IS NULL
    OR p_user_id = ''
    OR p_checkout_session_id IS NULL
    OR p_checkout_session_id = ''
    OR p_price_id IS NULL
    OR p_price_id = ''
    OR p_quantity <> 1
    OR p_amount_cents <= 0
    OR p_currency IS NULL
    OR p_currency = ''
    OR p_mode <> 'payment'
    OR p_payment_status <> 'paid'
    OR p_session_status <> 'complete'
    OR p_livemode IS NULL THEN
    RAISE EXCEPTION 'invalid Stripe checkout purchase identity' USING ERRCODE = '23514';
  END IF;

  SELECT *
  INTO v_event
  FROM public.stripe_webhook_events
  WHERE stripe_event_id = p_stripe_event_id
    AND event_type = p_event_type
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Stripe webhook receipt is required before grant'
      USING ERRCODE = '23514';
  END IF;

  IF v_event.status = 'processed' THEN
    RETURN 'duplicate_event';
  END IF;
  IF v_event.status = 'ignored' THEN
    RAISE EXCEPTION 'ignored Stripe webhook cannot grant credits' USING ERRCODE = '23514';
  END IF;

  UPDATE public.stripe_webhook_events
  SET status = 'processing',
      attempt_count = attempt_count + 1,
      last_attempt_at = now(),
      error_message = NULL,
      updated_at = now()
  WHERE id = v_event.id;

  PERFORM pg_advisory_xact_lock(hashtext('stripe-checkout:' || p_checkout_session_id));

  SELECT *
  INTO v_attempt
  FROM public.stripe_checkout_sessions
  WHERE stripe_session_id = p_checkout_session_id
  FOR UPDATE;

  IF NOT FOUND
    OR v_attempt.user_id IS DISTINCT FROM p_user_id
    OR v_attempt.stripe_price_id IS DISTINCT FROM p_price_id
    OR v_attempt.amount_cents IS DISTINCT FROM p_amount_cents
    OR v_attempt.currency IS DISTINCT FROM p_currency
    OR v_attempt.livemode IS DISTINCT FROM p_livemode THEN
    RAISE EXCEPTION 'Stripe purchase does not match a server-created Checkout session'
      USING ERRCODE = '23514';
  END IF;

  IF v_attempt.status = 'completed' THEN
    SELECT *
    INTO v_existing_payment
    FROM public.stripe_payments
    WHERE stripe_checkout_session_id = p_checkout_session_id
    FOR UPDATE;

    IF NOT FOUND
      OR v_existing_payment.user_id IS DISTINCT FROM v_attempt.user_id
      OR v_existing_payment.pack_code IS DISTINCT FROM v_attempt.pack_code
      OR v_existing_payment.amount_cents IS DISTINCT FROM v_attempt.amount_cents
      OR v_existing_payment.currency IS DISTINCT FROM v_attempt.currency
      OR v_existing_payment.credits_granted IS DISTINCT FROM v_attempt.credits
      OR v_existing_payment.status IS DISTINCT FROM 'paid' THEN
      RAISE EXCEPTION 'conflicting Stripe payment replay' USING ERRCODE = '23514';
    END IF;

    UPDATE public.stripe_webhook_events
    SET processed_at = now(), status = 'processed', updated_at = now()
    WHERE id = v_event.id;

    RETURN 'already_granted';
  END IF;

  IF v_attempt.status <> 'open' THEN
    RAISE EXCEPTION 'Stripe checkout session is not open for fulfillment'
      USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.stripe_payments (
    user_id,
    stripe_checkout_session_id,
    stripe_payment_intent_id,
    stripe_event_id,
    pack_code,
    amount_cents,
    currency,
    credits_granted,
    status
  )
  VALUES (
    v_attempt.user_id,
    p_checkout_session_id,
    NULLIF(p_payment_intent_id, ''),
    p_stripe_event_id,
    v_attempt.pack_code,
    v_attempt.amount_cents,
    v_attempt.currency,
    v_attempt.credits,
    'paid'
  )
  RETURNING id INTO v_payment_id;

  INSERT INTO public.credit_ledger (
    user_id,
    type,
    amount,
    stripe_payment_id,
    description,
    idempotency_key
  )
  VALUES (
    v_attempt.user_id,
    'purchase',
    v_attempt.credits,
    v_payment_id,
    'Purchased credit pack: ' || v_attempt.pack_code,
    'stripe-checkout:' || v_attempt.id::text
  );

  UPDATE public.stripe_checkout_sessions
  SET status = 'completed', updated_at = now()
  WHERE id = v_attempt.id;

  UPDATE public.stripe_webhook_events
  SET processed_at = now(), status = 'processed', updated_at = now()
  WHERE id = v_event.id;

  RETURN 'granted';
END;
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.expire_stripe_checkout_session(
  p_stripe_event_id text,
  p_event_type text,
  p_checkout_session_id text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog, public, pg_temp
AS $$
DECLARE
  v_event public.stripe_webhook_events%ROWTYPE;
  v_expired boolean;
BEGIN
  IF p_stripe_event_id IS NULL
    OR p_stripe_event_id = ''
    OR p_event_type <> 'checkout.session.expired'
    OR p_checkout_session_id IS NULL
    OR p_checkout_session_id = '' THEN
    RAISE EXCEPTION 'invalid Stripe checkout expiration identity' USING ERRCODE = '23514';
  END IF;

  SELECT *
  INTO v_event
  FROM public.stripe_webhook_events
  WHERE stripe_event_id = p_stripe_event_id
    AND event_type = p_event_type
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Stripe webhook receipt is required before expiration'
      USING ERRCODE = '23514';
  END IF;

  IF v_event.status IN ('processed', 'ignored') THEN
    RETURN 'duplicate_event';
  END IF;

  UPDATE public.stripe_webhook_events
  SET status = 'processing',
      attempt_count = attempt_count + 1,
      last_attempt_at = now(),
      error_message = NULL,
      updated_at = now()
  WHERE id = v_event.id;

  UPDATE public.stripe_checkout_sessions
  SET status = 'expired', updated_at = now()
  WHERE stripe_session_id = p_checkout_session_id
    AND status = 'open';

  v_expired := FOUND;

  UPDATE public.stripe_webhook_events
  SET processed_at = now(),
      status = CASE
        WHEN v_expired THEN 'processed'::public.stripe_webhook_event_status
        ELSE 'ignored'::public.stripe_webhook_event_status
      END,
      updated_at = now()
  WHERE id = v_event.id;

  RETURN 'expired';
END;
$$;--> statement-breakpoint

ALTER TYPE public.stripe_webhook_event_status OWNER TO repurposepro_owner;--> statement-breakpoint
ALTER TYPE public.processing_failure_intent_status OWNER TO repurposepro_owner;--> statement-breakpoint
ALTER TABLE public.processing_failure_intents OWNER TO repurposepro_owner;--> statement-breakpoint
ALTER FUNCTION public.is_processing_failure_code_supported(text) OWNER TO repurposepro_owner;--> statement-breakpoint
ALTER FUNCTION public.preserve_terminal_processing_failure() OWNER TO repurposepro_owner;--> statement-breakpoint
ALTER FUNCTION public.persist_processing_failure_intent(uuid, text, text, text)
  OWNER TO repurposepro_owner;--> statement-breakpoint
ALTER FUNCTION public.claim_processing_failure_intent(text, uuid)
  OWNER TO repurposepro_owner;--> statement-breakpoint
ALTER FUNCTION public.mark_processing_failure_intent_finalized(uuid, uuid)
  OWNER TO repurposepro_owner;--> statement-breakpoint
ALTER FUNCTION public.reschedule_processing_failure_intent(uuid, uuid, integer)
  OWNER TO repurposepro_owner;--> statement-breakpoint
ALTER FUNCTION public.touch_analysis_execution_lease(uuid, text, integer)
  OWNER TO repurposepro_owner;--> statement-breakpoint
ALTER FUNCTION public.claim_pending_analysis_dispatch(text, uuid)
  OWNER TO repurposepro_owner;--> statement-breakpoint
ALTER FUNCTION public.receive_stripe_webhook_event(text, text)
  OWNER TO repurposepro_owner;--> statement-breakpoint
ALTER FUNCTION public.mark_stripe_webhook_event_failed(text, text, text)
  OWNER TO repurposepro_owner;--> statement-breakpoint
ALTER FUNCTION public.validate_stripe_webhook_event_update()
  OWNER TO repurposepro_owner;--> statement-breakpoint

REVOKE ALL ON TABLE public.processing_failure_intents
  FROM PUBLIC, repurposepro_runtime, repurposepro_checkout, repurposepro_webhook, repurposepro_processing;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.is_processing_failure_code_supported(text)
  FROM PUBLIC, repurposepro_runtime, repurposepro_checkout, repurposepro_webhook, repurposepro_processing;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.preserve_terminal_processing_failure()
  FROM PUBLIC, repurposepro_runtime, repurposepro_checkout, repurposepro_webhook, repurposepro_processing;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.persist_processing_failure_intent(uuid, text, text, text)
  FROM PUBLIC, repurposepro_runtime, repurposepro_checkout, repurposepro_webhook;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.claim_processing_failure_intent(text, uuid)
  FROM PUBLIC, repurposepro_runtime, repurposepro_checkout, repurposepro_webhook;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.mark_processing_failure_intent_finalized(uuid, uuid)
  FROM PUBLIC, repurposepro_runtime, repurposepro_checkout, repurposepro_webhook;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.reschedule_processing_failure_intent(uuid, uuid, integer)
  FROM PUBLIC, repurposepro_runtime, repurposepro_checkout, repurposepro_webhook;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.touch_analysis_execution_lease(uuid, text, integer)
  FROM PUBLIC, repurposepro_runtime, repurposepro_checkout, repurposepro_webhook;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.claim_pending_analysis_dispatch(text, uuid)
  FROM PUBLIC, repurposepro_runtime, repurposepro_checkout, repurposepro_webhook;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.receive_stripe_webhook_event(text, text)
  FROM PUBLIC, repurposepro_runtime, repurposepro_checkout, repurposepro_processing;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.mark_stripe_webhook_event_failed(text, text, text)
  FROM PUBLIC, repurposepro_runtime, repurposepro_checkout, repurposepro_processing;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.validate_stripe_webhook_event_update()
  FROM PUBLIC, repurposepro_runtime, repurposepro_checkout, repurposepro_webhook, repurposepro_processing;--> statement-breakpoint

GRANT EXECUTE ON FUNCTION public.persist_processing_failure_intent(uuid, text, text, text)
  TO repurposepro_processing;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.claim_processing_failure_intent(text, uuid)
  TO repurposepro_processing;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.mark_processing_failure_intent_finalized(uuid, uuid)
  TO repurposepro_processing;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.reschedule_processing_failure_intent(uuid, uuid, integer)
  TO repurposepro_processing;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.touch_analysis_execution_lease(uuid, text, integer)
  TO repurposepro_processing;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.claim_pending_analysis_dispatch(text, uuid)
  TO repurposepro_processing;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.receive_stripe_webhook_event(text, text)
  TO repurposepro_webhook;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.mark_stripe_webhook_event_failed(text, text, text)
  TO repurposepro_webhook;
