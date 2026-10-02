ALTER TABLE public.analysis_stage_attempts OWNER TO repurposepro_owner;
--> statement-breakpoint
REVOKE ALL ON public.analysis_stage_attempts FROM PUBLIC, repurposepro_runtime,
  repurposepro_checkout, repurposepro_webhook, repurposepro_processing;
--> statement-breakpoint
GRANT SELECT ON public.analysis_stage_attempts TO repurposepro_processing;
--> statement-breakpoint
GRANT SELECT(processing_job_id,failure_code,status) ON public.processing_failure_intents TO repurposepro_runtime;
--> statement-breakpoint
CREATE FUNCTION public.begin_analysis_stage_attempt(p_job uuid, p_worker text, p_token uuid, p_stage text)
RETURNS TABLE(outcome text, attempt integer, failure_code text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog, public, pg_temp AS $$
DECLARE j public.processing_jobs; a public.analysis_stage_attempts; budget integer;
BEGIN
  IF p_stage IS NULL OR p_stage NOT IN ('transcription', 'selection') THEN
    RAISE EXCEPTION 'invalid analysis stage' USING ERRCODE='23514';
  END IF;
  PERFORM 1 FROM public.projects p JOIN public.processing_jobs j0 ON j0.project_id=p.id
    WHERE j0.id=p_job AND p.current_job_id=p_job AND p.deleted_at IS NULL FOR UPDATE OF p;
  IF NOT FOUND THEN RETURN QUERY SELECT 'lost',0,NULL::text; RETURN; END IF;
  SELECT * INTO j FROM public.processing_jobs WHERE id=p_job FOR UPDATE;
  IF NOT FOUND OR j.type<>'analyze_video' OR j.status<>'active'
    OR j.execution_lease_owner IS DISTINCT FROM p_worker OR j.execution_lease_token IS DISTINCT FROM p_token
    OR j.execution_lease_expires_at IS NULL OR j.execution_lease_expires_at<=clock_timestamp()
    OR EXISTS(SELECT 1 FROM public.processing_failure_intents WHERE processing_job_id=p_job) THEN
    RETURN QUERY SELECT 'lost', 0, NULL::text; RETURN;
  END IF;
  budget:=CASE WHEN p_stage='transcription' THEN 2 ELSE 3 END;
  INSERT INTO public.analysis_stage_attempts(job_id,stage) VALUES(p_job,p_stage) ON CONFLICT DO NOTHING;
  SELECT * INTO a FROM public.analysis_stage_attempts WHERE job_id=p_job AND stage=p_stage FOR UPDATE;
  IF a.attempts>=budget THEN RETURN QUERY SELECT 'exhausted',a.attempts,a.last_failure_code; RETURN; END IF;
  UPDATE public.analysis_stage_attempts SET attempts=attempts+1,updated_at=clock_timestamp()
    WHERE job_id=p_job AND stage=p_stage RETURNING * INTO a;
  RETURN QUERY SELECT 'started',a.attempts,a.last_failure_code;
END $$;
--> statement-breakpoint
CREATE FUNCTION public.record_analysis_stage_failure(p_job uuid,p_worker text,p_token uuid,p_stage text,p_code text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog,public,pg_temp AS $$
BEGIN
  IF p_code IS NULL OR NOT public.is_processing_failure_code_supported(p_code) THEN
    RAISE EXCEPTION 'unsupported analysis failure' USING ERRCODE='23514';
  END IF;
  PERFORM 1 FROM public.projects p JOIN public.processing_jobs j ON j.project_id=p.id
    WHERE j.id=p_job AND p.current_job_id=p_job AND p.deleted_at IS NULL FOR UPDATE OF p;
  IF NOT FOUND THEN RETURN 'lost'; END IF;
  PERFORM 1 FROM public.processing_jobs j WHERE j.id=p_job AND j.type='analyze_video' AND j.status='active'
    AND j.execution_lease_owner=p_worker AND j.execution_lease_token=p_token
    AND j.execution_lease_expires_at>clock_timestamp() FOR UPDATE;
  IF NOT FOUND THEN RETURN 'lost'; END IF;
  UPDATE public.analysis_stage_attempts SET last_failure_code=p_code,updated_at=clock_timestamp()
    WHERE job_id=p_job AND stage=p_stage AND attempts>0;
  IF NOT FOUND THEN RETURN 'lost'; END IF;
  RETURN 'recorded';
END $$;
--> statement-breakpoint
CREATE FUNCTION public.persist_analysis_terminal_failure(p_job uuid,p_worker text,p_token uuid,p_code text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog,public,pg_temp AS $$
DECLARE j public.processing_jobs; result text;
BEGIN
  PERFORM 1 FROM public.projects p JOIN public.processing_jobs j0 ON j0.project_id=p.id
    WHERE j0.id=p_job AND p.current_job_id=p_job AND p.deleted_at IS NULL FOR UPDATE OF p;
  IF NOT FOUND THEN RETURN 'lost'; END IF;
  SELECT * INTO j FROM public.processing_jobs WHERE id=p_job FOR UPDATE;
  IF NOT FOUND OR j.type<>'analyze_video' OR j.status<>'active'
    OR j.execution_lease_owner IS DISTINCT FROM p_worker OR j.execution_lease_token IS DISTINCT FROM p_token
    OR j.execution_lease_expires_at IS NULL OR j.execution_lease_expires_at<=clock_timestamp() THEN RETURN 'lost'; END IF;
  result:=public.persist_processing_failure_intent(p_job,p_code,'Processing failed before a usable preview was saved.','worker:'||p_worker);
  IF result IN ('persisted','duplicate','finalized') THEN
    UPDATE public.processing_jobs SET execution_lease_token=NULL,execution_lease_owner=NULL,
      execution_lease_expires_at=NULL,execution_heartbeat_at=NULL,updated_at=clock_timestamp() WHERE id=p_job;
  END IF;
  RETURN result;
END $$;
--> statement-breakpoint
-- Resolve generic queue/crash observations from durable classified worker failures.
ALTER FUNCTION public.persist_processing_failure_intent(uuid,text,text,text) RENAME TO persist_processing_failure_intent_v1;
--> statement-breakpoint
CREATE FUNCTION public.persist_processing_failure_intent(p_job_id uuid,p_failure_code text,p_safe_message text,p_source_reference text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog,public,pg_temp AS $$
DECLARE code text;
BEGIN
  code:=p_failure_code;
  IF code IN ('ANALYSIS_RETRIES_EXHAUSTED','WORKER_EXECUTION_LEASE_EXPIRED') THEN
    SELECT COALESCE(
      (SELECT failure_code FROM public.processing_failure_intents WHERE processing_job_id=p_job_id),
      (SELECT last_failure_code FROM public.analysis_stage_attempts WHERE job_id=p_job_id
       AND last_failure_code IS NOT NULL ORDER BY updated_at DESC LIMIT 1),code) INTO code;
  END IF;
  RETURN public.persist_processing_failure_intent_v1(p_job_id,code,p_safe_message,p_source_reference);
END $$;
--> statement-breakpoint
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
ALTER FUNCTION public.begin_analysis_stage_attempt(uuid,text,uuid,text) OWNER TO repurposepro_owner;
--> statement-breakpoint
ALTER FUNCTION public.record_analysis_stage_failure(uuid,text,uuid,text,text) OWNER TO repurposepro_owner;
--> statement-breakpoint
ALTER FUNCTION public.persist_analysis_terminal_failure(uuid,text,uuid,text) OWNER TO repurposepro_owner;
--> statement-breakpoint
ALTER FUNCTION public.persist_processing_failure_intent(uuid,text,text,text) OWNER TO repurposepro_owner;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.persist_processing_failure_intent_v1(uuid,text,text,text) FROM PUBLIC,repurposepro_runtime,repurposepro_processing,repurposepro_checkout,repurposepro_webhook;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.begin_analysis_stage_attempt(uuid,text,uuid,text),public.record_analysis_stage_failure(uuid,text,uuid,text,text),public.persist_analysis_terminal_failure(uuid,text,uuid,text),public.persist_processing_failure_intent(uuid,text,text,text) FROM PUBLIC,repurposepro_runtime,repurposepro_checkout,repurposepro_webhook;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.begin_analysis_stage_attempt(uuid,text,uuid,text),public.record_analysis_stage_failure(uuid,text,uuid,text,text),public.persist_analysis_terminal_failure(uuid,text,uuid,text),public.persist_processing_failure_intent(uuid,text,text,text) TO repurposepro_processing;
--> statement-breakpoint
CREATE FUNCTION public.initialize_analysis_stage_attempts() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog,public,pg_temp AS $$
BEGIN
  IF NEW.type='analyze_video' THEN
    INSERT INTO public.analysis_stage_attempts(job_id,stage) VALUES(NEW.id,'transcription'),(NEW.id,'selection');
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
ALTER FUNCTION public.initialize_analysis_stage_attempts() OWNER TO repurposepro_owner;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.initialize_analysis_stage_attempts() FROM PUBLIC,repurposepro_runtime,repurposepro_processing,repurposepro_checkout,repurposepro_webhook;
--> statement-breakpoint
CREATE TRIGGER initialize_analysis_stage_attempts AFTER INSERT ON public.processing_jobs
FOR EACH ROW EXECUTE FUNCTION public.initialize_analysis_stage_attempts();
--> statement-breakpoint
INSERT INTO public.analysis_stage_attempts(job_id,stage)
SELECT j.id,s.stage FROM public.processing_jobs j CROSS JOIN (VALUES('transcription'),('selection')) s(stage)
WHERE j.type='analyze_video' AND j.status IN ('queued','active') ON CONFLICT DO NOTHING;
--> statement-breakpoint
ALTER FUNCTION public.acquire_analysis_execution_lease(uuid,uuid,text) RENAME TO acquire_analysis_execution_lease_v1;
--> statement-breakpoint
CREATE FUNCTION public.acquire_analysis_execution_lease(p_job_id uuid,p_project_id uuid,p_worker_id text)
RETURNS TABLE(outcome text,lease_token uuid,expires_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog,public,pg_temp AS $$
BEGIN
  PERFORM 1 FROM public.projects WHERE id=p_project_id FOR UPDATE;
  PERFORM 1 FROM public.processing_jobs WHERE id=p_job_id FOR UPDATE;
  IF EXISTS(SELECT 1 FROM public.processing_failure_intents WHERE processing_job_id=p_job_id) THEN
    RETURN QUERY SELECT 'rejected',NULL::uuid,NULL::timestamptz; RETURN;
  END IF;
  RETURN QUERY SELECT r.outcome,r.lease_token,r.expires_at
    FROM public.acquire_analysis_execution_lease_v1(p_job_id,p_project_id,p_worker_id) r;
END $$;
--> statement-breakpoint
ALTER FUNCTION public.acquire_analysis_execution_lease(uuid,uuid,text) OWNER TO repurposepro_owner;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.acquire_analysis_execution_lease_v1(uuid,uuid,text),public.acquire_analysis_execution_lease(uuid,uuid,text)
FROM PUBLIC,repurposepro_runtime,repurposepro_processing,repurposepro_checkout,repurposepro_webhook;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.acquire_analysis_execution_lease(uuid,uuid,text) TO repurposepro_processing;

--> statement-breakpoint
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

    IF EXISTS(SELECT 1 FROM public.processing_failure_intents i WHERE i.processing_job_id=v_project.current_job_id AND i.status='pending')
      AND v_existing_job.status <> 'refunded' THEN
      RETURN QUERY SELECT 'invalid_project_state',NULL::uuid,v_project.id,NULL::processing_job_status,NULL::integer;
      RETURN;
    END IF;
    IF v_existing_job.id IS NOT NULL AND v_existing_job.status IN ('queued', 'active') THEN
      RETURN QUERY SELECT
        'existing',
        v_existing_job.id,
        v_existing_job.project_id,
        v_existing_job.status,
        v_existing_job.credits_charged;
      RETURN;
    END IF;
  END IF;

  IF v_project.status = 'refunded' AND (
    v_existing_job.id IS NULL OR v_existing_job.status <> 'refunded'
    OR v_existing_job.refund_completed_at IS NULL OR v_existing_job.credits_charged <= 0
    OR NOT EXISTS(SELECT 1 FROM public.credit_ledger l WHERE l.processing_job_id=v_existing_job.id
      AND l.project_id=v_project.id AND l.user_id=p_user_id AND l.type='refund' AND l.amount=v_existing_job.credits_charged)
  ) THEN
    RETURN QUERY SELECT 'invalid_project_state',NULL::uuid,v_project.id,NULL::processing_job_status,NULL::integer;
    RETURN;
  END IF;

  IF v_project.status NOT IN ('uploaded','refunded') THEN
    RETURN QUERY SELECT 'invalid_project_state', NULL::uuid, v_project.id, NULL::processing_job_status, NULL::integer;
    RETURN;
  END IF;

  SELECT *
  INTO v_video
  FROM public.uploaded_videos AS uploaded_video
  WHERE uploaded_video.project_id = v_project.id
    AND uploaded_video.deleted_at IS NULL
    AND uploaded_video.has_audio IS TRUE
    AND uploaded_video.expires_at > clock_timestamp()
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
