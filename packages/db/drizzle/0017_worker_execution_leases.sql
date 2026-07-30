DROP FUNCTION public.touch_analysis_execution_lease(uuid, text, integer);--> statement-breakpoint

CREATE FUNCTION public.acquire_analysis_execution_lease(
  p_job_id uuid,
  p_project_id uuid,
  p_worker_id text
)
RETURNS TABLE (
  outcome text,
  lease_token uuid,
  expires_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog, public, pg_temp
AS $$
DECLARE
  v_deduction_amount integer;
  v_deduction_count integer;
  v_expires_at timestamptz;
  v_job public.processing_jobs%ROWTYPE;
  v_lease_token uuid;
BEGIN
  IF p_job_id IS NULL
    OR p_project_id IS NULL
    OR p_worker_id IS NULL
    OR p_worker_id = ''
    OR length(p_worker_id) > 200 THEN
    RAISE EXCEPTION 'analysis execution lease input is invalid' USING ERRCODE = '23514';
  END IF;

  SELECT *
  INTO v_job
  FROM public.processing_jobs AS job
  WHERE job.id = p_job_id
  FOR UPDATE;

  IF NOT FOUND
    OR v_job.project_id IS DISTINCT FROM p_project_id
    OR v_job.type IS DISTINCT FROM 'analyze_video'
    OR v_job.status NOT IN ('queued', 'active')
    OR v_job.credits_charged <= 0 THEN
    RETURN QUERY SELECT 'rejected', NULL::uuid, NULL::timestamptz;
    RETURN;
  END IF;

  PERFORM 1
  FROM public.projects AS project
  WHERE project.id = v_job.project_id
    AND project.user_id = v_job.user_id
    AND project.current_job_id = v_job.id
    AND project.deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'rejected', NULL::uuid, NULL::timestamptz;
    RETURN;
  END IF;

  SELECT COUNT(*)::integer, MIN(deduction.amount)
  INTO v_deduction_count, v_deduction_amount
  FROM public.credit_ledger AS deduction
  WHERE deduction.processing_job_id = v_job.id
    AND deduction.project_id = v_job.project_id
    AND deduction.user_id = v_job.user_id
    AND deduction.type = 'processing_deduction';

  IF v_deduction_count <> 1 OR v_deduction_amount <> -v_job.credits_charged THEN
    RETURN QUERY SELECT 'rejected', NULL::uuid, NULL::timestamptz;
    RETURN;
  END IF;

  PERFORM 1
  FROM public.processing_job_dispatches AS dispatch
  WHERE dispatch.processing_job_id = v_job.id
    AND dispatch.status = 'published'
    AND dispatch.bullmq_job_id = v_job.id::text
    AND v_job.bullmq_job_id = v_job.id::text
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'rejected', NULL::uuid, NULL::timestamptz;
    RETURN;
  END IF;

  IF v_job.status = 'active'
    AND v_job.execution_lease_expires_at > now() THEN
    IF v_job.execution_lease_owner = p_worker_id THEN
      RETURN QUERY
      SELECT
        'acquired',
        v_job.execution_lease_token,
        v_job.execution_lease_expires_at;
    ELSE
      RETURN QUERY SELECT 'busy', NULL::uuid, NULL::timestamptz;
    END IF;
    RETURN;
  END IF;

  v_lease_token := gen_random_uuid();
  v_expires_at := now() + interval '60 seconds';

  UPDATE public.processing_jobs
  SET status = 'active',
      step = 'preparing',
      progress = 10,
      attempt_count = attempt_count + 1,
      execution_lease_token = v_lease_token,
      execution_lease_owner = p_worker_id,
      execution_lease_expires_at = v_expires_at,
      execution_heartbeat_at = now(),
      started_at = COALESCE(started_at, now()),
      updated_at = now()
  WHERE id = v_job.id;

  RETURN QUERY SELECT 'acquired', v_lease_token, v_expires_at;
END;
$$;--> statement-breakpoint

CREATE FUNCTION public.renew_analysis_execution_lease(
  p_job_id uuid,
  p_worker_id text,
  p_lease_token uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog, public, pg_temp
AS $$
BEGIN
  IF p_job_id IS NULL
    OR p_worker_id IS NULL
    OR p_worker_id = ''
    OR length(p_worker_id) > 200
    OR p_lease_token IS NULL THEN
    RAISE EXCEPTION 'analysis execution lease renewal input is invalid'
      USING ERRCODE = '23514';
  END IF;

  UPDATE public.processing_jobs
  SET execution_lease_expires_at = now() + interval '60 seconds',
      execution_heartbeat_at = now(),
      updated_at = now()
  WHERE id = p_job_id
    AND type = 'analyze_video'
    AND status = 'active'
    AND execution_lease_owner = p_worker_id
    AND execution_lease_token = p_lease_token
    AND execution_lease_expires_at > now();

  RETURN CASE WHEN FOUND THEN 'renewed' ELSE 'lost' END;
END;
$$;--> statement-breakpoint

CREATE FUNCTION public.release_analysis_execution_lease(
  p_job_id uuid,
  p_worker_id text,
  p_lease_token uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog, public, pg_temp
AS $$
DECLARE
  v_project_id uuid;
  v_user_id text;
BEGIN
  IF p_job_id IS NULL
    OR p_worker_id IS NULL
    OR p_worker_id = ''
    OR length(p_worker_id) > 200
    OR p_lease_token IS NULL THEN
    RAISE EXCEPTION 'analysis execution lease release input is invalid'
      USING ERRCODE = '23514';
  END IF;

  UPDATE public.processing_jobs
  SET status = 'queued',
      step = 'queued',
      progress = 0,
      execution_lease_token = NULL,
      execution_lease_owner = NULL,
      execution_lease_expires_at = NULL,
      execution_heartbeat_at = NULL,
      updated_at = now()
  WHERE id = p_job_id
    AND type = 'analyze_video'
    AND status = 'active'
    AND execution_lease_owner = p_worker_id
    AND execution_lease_token = p_lease_token
    AND execution_lease_expires_at > now()
  RETURNING project_id, user_id INTO v_project_id, v_user_id;

  IF NOT FOUND THEN
    RETURN 'lost';
  END IF;

  UPDATE public.projects
  SET status = 'queued', updated_at = now()
  WHERE id = v_project_id
    AND user_id = v_user_id
    AND current_job_id = p_job_id;

  RETURN 'released';
END;
$$;--> statement-breakpoint

CREATE FUNCTION public.update_analysis_execution_progress(
  p_job_id uuid,
  p_worker_id text,
  p_lease_token uuid,
  p_step public.processing_step,
  p_progress integer
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog, public, pg_temp
AS $$
DECLARE
  v_project_id uuid;
  v_project_status public.project_status;
  v_user_id text;
BEGIN
  IF p_job_id IS NULL
    OR p_worker_id IS NULL
    OR p_worker_id = ''
    OR length(p_worker_id) > 200
    OR p_lease_token IS NULL
    OR p_step NOT IN (
      'preparing',
      'extracting_audio',
      'transcribing',
      'analyzing',
      'generating_preview'
    )
    OR p_progress < 10
    OR p_progress > 99 THEN
    RAISE EXCEPTION 'analysis progress input is invalid' USING ERRCODE = '23514';
  END IF;

  UPDATE public.processing_jobs
  SET step = p_step,
      progress = p_progress,
      updated_at = now()
  WHERE id = p_job_id
    AND type = 'analyze_video'
    AND status = 'active'
    AND execution_lease_owner = p_worker_id
    AND execution_lease_token = p_lease_token
    AND execution_lease_expires_at > now()
    AND (progress IS NULL OR progress <= p_progress)
  RETURNING project_id, user_id INTO v_project_id, v_user_id;

  IF NOT FOUND THEN
    RETURN 'lost';
  END IF;

  v_project_status := CASE
    WHEN p_step IN ('preparing', 'extracting_audio', 'transcribing') THEN 'transcribing'
    ELSE 'analyzing'
  END;

  UPDATE public.projects
  SET status = v_project_status, updated_at = now()
  WHERE id = v_project_id
    AND user_id = v_user_id
    AND current_job_id = p_job_id;

  RETURN 'updated';
END;
$$;--> statement-breakpoint

ALTER FUNCTION public.finalize_failed_processing_job(uuid, text, text)
  RENAME TO finalize_failed_processing_job_v1;--> statement-breakpoint

REVOKE ALL ON FUNCTION public.finalize_failed_processing_job_v1(uuid, text, text)
  FROM PUBLIC, repurposepro_runtime, repurposepro_checkout, repurposepro_webhook,
    repurposepro_processing;--> statement-breakpoint

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
  v_lease_expires_at timestamptz;
  v_status public.processing_job_status;
BEGIN
  SELECT job.status, job.execution_lease_expires_at
  INTO v_status, v_lease_expires_at
  FROM public.processing_jobs AS job
  WHERE job.id = p_job_id
  FOR UPDATE;

  IF FOUND
    AND v_status = 'active'
    AND v_lease_expires_at > now() THEN
    RETURN QUERY SELECT 'lease_active', 0;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT result.outcome, result.refunded_credits
  FROM public.finalize_failed_processing_job_v1(
    p_job_id,
    p_failure_code,
    p_error_message
  ) AS result;
END;
$$;--> statement-breakpoint

DROP FUNCTION public.claim_processing_failure_intent(text, uuid);--> statement-breakpoint

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
    JOIN public.processing_jobs AS job
      ON job.id = intent.processing_job_id
    WHERE intent.status = 'pending'
      AND intent.next_attempt_at <= now()
      AND (intent.lease_expires_at IS NULL OR intent.lease_expires_at <= now())
      AND (p_job_id IS NULL OR intent.processing_job_id = p_job_id)
      AND NOT (
        job.status = 'active'
        AND job.execution_lease_expires_at > now()
      )
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
  last_failure_stage text,
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
    claimed.last_failure_stage,
    claimed.lease_token,
    job.project_id
  FROM claimed
  JOIN public.processing_jobs AS job
    ON job.id = claimed.processing_job_id;
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
    OR p_failure_stage NOT IN (
      'active_job_missing',
      'queue_handoff_wait',
      'queue_publish',
      'queue_reference_persist'
    )
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

ALTER FUNCTION public.acquire_analysis_execution_lease(uuid, uuid, text)
  OWNER TO repurposepro_owner;--> statement-breakpoint
ALTER FUNCTION public.renew_analysis_execution_lease(uuid, text, uuid)
  OWNER TO repurposepro_owner;--> statement-breakpoint
ALTER FUNCTION public.release_analysis_execution_lease(uuid, text, uuid)
  OWNER TO repurposepro_owner;--> statement-breakpoint
ALTER FUNCTION public.update_analysis_execution_progress(
  uuid,
  text,
  uuid,
  public.processing_step,
  integer
) OWNER TO repurposepro_owner;--> statement-breakpoint
ALTER FUNCTION public.finalize_failed_processing_job_v1(uuid, text, text)
  OWNER TO repurposepro_owner;--> statement-breakpoint
ALTER FUNCTION public.finalize_failed_processing_job(uuid, text, text)
  OWNER TO repurposepro_owner;--> statement-breakpoint
ALTER FUNCTION public.claim_processing_failure_intent(text, uuid)
  OWNER TO repurposepro_owner;--> statement-breakpoint
ALTER FUNCTION public.claim_pending_analysis_dispatch(text, uuid)
  OWNER TO repurposepro_owner;--> statement-breakpoint

REVOKE ALL ON FUNCTION public.acquire_analysis_execution_lease(uuid, uuid, text)
  FROM PUBLIC, repurposepro_runtime, repurposepro_checkout, repurposepro_webhook;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.renew_analysis_execution_lease(uuid, text, uuid)
  FROM PUBLIC, repurposepro_runtime, repurposepro_checkout, repurposepro_webhook;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.release_analysis_execution_lease(uuid, text, uuid)
  FROM PUBLIC, repurposepro_runtime, repurposepro_checkout, repurposepro_webhook;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.update_analysis_execution_progress(
  uuid,
  text,
  uuid,
  public.processing_step,
  integer
) FROM PUBLIC, repurposepro_runtime, repurposepro_checkout, repurposepro_webhook;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.finalize_failed_processing_job(uuid, text, text)
  FROM PUBLIC, repurposepro_runtime, repurposepro_checkout, repurposepro_webhook;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.claim_processing_failure_intent(text, uuid)
  FROM PUBLIC, repurposepro_runtime, repurposepro_checkout, repurposepro_webhook;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.claim_pending_analysis_dispatch(text, uuid)
  FROM PUBLIC, repurposepro_runtime, repurposepro_checkout, repurposepro_webhook;--> statement-breakpoint

GRANT EXECUTE ON FUNCTION public.acquire_analysis_execution_lease(uuid, uuid, text)
  TO repurposepro_processing;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.renew_analysis_execution_lease(uuid, text, uuid)
  TO repurposepro_processing;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.release_analysis_execution_lease(uuid, text, uuid)
  TO repurposepro_processing;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.update_analysis_execution_progress(
  uuid,
  text,
  uuid,
  public.processing_step,
  integer
) TO repurposepro_processing;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.finalize_failed_processing_job(uuid, text, text)
  TO repurposepro_processing;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.claim_processing_failure_intent(text, uuid)
  TO repurposepro_processing;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.claim_pending_analysis_dispatch(text, uuid)
  TO repurposepro_processing;
