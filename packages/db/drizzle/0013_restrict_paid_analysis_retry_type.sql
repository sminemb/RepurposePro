CREATE OR REPLACE FUNCTION public.start_paid_video_analysis(
  p_user_id text,
  p_project_id uuid
)
RETURNS TABLE(
  outcome text,
  job_id uuid,
  project_id uuid,
  status processing_job_status,
  credits_charged integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog, public, pg_temp
AS $$
DECLARE
  v_balance bigint;
  v_existing_job public.processing_jobs%ROWTYPE;
  v_job_id uuid;
  v_project public.projects%ROWTYPE;
  v_required_credits integer;
  v_video public.uploaded_videos%ROWTYPE;
BEGIN
  IF p_user_id IS NULL OR p_user_id = '' OR p_project_id IS NULL THEN
    RAISE EXCEPTION 'processing user and project identity are required' USING ERRCODE = '23514';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('credit-ledger:' || p_user_id));

  SELECT *
  INTO v_project
  FROM public.projects AS project
  WHERE project.id = p_project_id
    AND project.user_id = p_user_id
    AND project.deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'project_not_found', NULL::uuid, NULL::uuid, NULL::processing_job_status, NULL::integer;
    RETURN;
  END IF;

  IF v_project.current_job_id IS NOT NULL THEN
    SELECT *
    INTO v_existing_job
    FROM public.processing_jobs AS processing_job
    WHERE processing_job.id = v_project.current_job_id
      AND processing_job.project_id = v_project.id
      AND processing_job.user_id = p_user_id
      AND processing_job.type = 'analyze_video'
    FOR UPDATE;

    IF FOUND AND v_existing_job.status IN ('queued', 'active') THEN
      RETURN QUERY SELECT
        'existing',
        v_existing_job.id,
        v_existing_job.project_id,
        v_existing_job.status,
        v_existing_job.credits_charged;
      RETURN;
    END IF;
  END IF;

  IF v_project.status <> 'uploaded' THEN
    RETURN QUERY SELECT 'invalid_project_state', NULL::uuid, v_project.id, NULL::processing_job_status, NULL::integer;
    RETURN;
  END IF;

  SELECT *
  INTO v_video
  FROM public.uploaded_videos AS uploaded_video
  WHERE uploaded_video.project_id = v_project.id
    AND uploaded_video.deleted_at IS NULL
    AND uploaded_video.has_audio IS TRUE
  FOR UPDATE;

  IF NOT FOUND OR v_video.duration_seconds <= 0 THEN
    RETURN QUERY SELECT 'video_required', NULL::uuid, v_project.id, NULL::processing_job_status, NULL::integer;
    RETURN;
  END IF;

  v_required_credits := CEIL(v_video.duration_seconds / 60)::integer;

  SELECT COALESCE(SUM(amount), 0)
  INTO v_balance
  FROM public.credit_ledger AS ledger
  WHERE ledger.user_id = p_user_id;

  IF v_balance < v_required_credits THEN
    RETURN QUERY SELECT 'insufficient_credits', NULL::uuid, v_project.id, NULL::processing_job_status, v_required_credits;
    RETURN;
  END IF;

  INSERT INTO public.processing_jobs (
    project_id,
    user_id,
    type,
    status,
    step,
    progress,
    credits_charged
  )
  VALUES (
    v_project.id,
    p_user_id,
    'analyze_video',
    'queued',
    'queued',
    0,
    v_required_credits
  )
  RETURNING id INTO v_job_id;

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
    p_user_id,
    'processing_deduction',
    -v_required_credits,
    v_project.id,
    v_job_id,
    'Processing started: ' || v_project.name,
    'processing-deduction:' || v_job_id
  );

  UPDATE public.projects
  SET current_job_id = v_job_id,
      status = 'queued',
      updated_at = now()
  WHERE projects.id = v_project.id;

  RETURN QUERY SELECT 'created', v_job_id, v_project.id, 'queued'::processing_job_status, v_required_credits;
END;
$$;--> statement-breakpoint

ALTER FUNCTION public.start_paid_video_analysis(text, uuid) OWNER TO repurposepro_owner;--> statement-breakpoint

REVOKE ALL ON FUNCTION public.start_paid_video_analysis(text, uuid) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.start_paid_video_analysis(text, uuid) TO repurposepro_runtime;
