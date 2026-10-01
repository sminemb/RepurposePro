-- Reject wrong job types and empty lease tokens before mutating jobs.

--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.acquire_clip_regeneration(p_job uuid,p_project uuid,p_token uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog,public,pg_temp AS $$
DECLARE j public.processing_jobs; r public.clip_regeneration_requests;
BEGIN
 PERFORM 1 FROM public.projects WHERE id=p_project AND current_job_id=p_job AND deleted_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RETURN NULL; END IF;
 SELECT * INTO j FROM public.processing_jobs WHERE id=p_job AND project_id=p_project AND type='regenerate_clip_candidate' FOR UPDATE;
 IF NOT FOUND OR p_token IS NULL THEN RETURN NULL; END IF;
 IF j.status IN ('completed','failed') THEN RETURN jsonb_build_object('terminal',true); END IF;
 IF j.status NOT IN ('queued','active') OR j.attempt_count>=2 OR j.execution_lease_expires_at>clock_timestamp() THEN RETURN NULL; END IF;
 SELECT * INTO r FROM public.clip_regeneration_requests WHERE job_id=p_job;
 IF NOT EXISTS(SELECT 1 FROM public.projects p JOIN public.clip_candidates c ON c.id=r.clip_id WHERE p.id=p_project AND p.current_analysis_job_id=r.analysis_job_id AND c.deleted_at IS NULL AND c.edit_revision=r.expected_revision) THEN RETURN NULL; END IF;
 UPDATE public.processing_jobs SET status='active',step='analyzing',progress=10,attempt_count=attempt_count+1,started_at=COALESCE(started_at,now()),execution_lease_token=p_token,execution_lease_owner='regeneration-worker',execution_lease_expires_at=clock_timestamp()+interval '60 seconds',execution_heartbeat_at=clock_timestamp() WHERE id=p_job;
 RETURN r.snapshot;
END $$;

--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.acquire_clip_batch_render(p_job uuid,p_project uuid,p_token uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog,public,pg_temp AS $$
DECLARE j public.processing_jobs;
BEGIN
 PERFORM 1 FROM public.projects WHERE id=p_project AND current_job_id=p_job AND deleted_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RETURN NULL; END IF;
 SELECT * INTO j FROM public.processing_jobs WHERE id=p_job AND project_id=p_project AND type='render_clips' FOR UPDATE;
 IF NOT FOUND OR p_token IS NULL THEN RETURN NULL; END IF;
 IF j.status IN ('completed','failed') THEN RETURN jsonb_build_object('terminal',true); END IF;
 IF j.status NOT IN ('queued','active') OR j.execution_lease_expires_at>clock_timestamp() THEN RETURN NULL; END IF;
 UPDATE public.render_item_progress SET status=CASE WHEN attempt_count>=2 THEN 'failed' ELSE 'queued' END,step=CASE WHEN attempt_count>=2 THEN 'failed' ELSE 'queued' END,error_code='RENDER_LEASE_EXPIRED',error_message='This clip was interrupted. Try exporting it again.' WHERE job_id=p_job AND status='active';
 IF public.finish_clip_batch(p_job) THEN RETURN jsonb_build_object('terminal',true); END IF;
 UPDATE public.processing_jobs SET status='active',step='preparing',attempt_count=attempt_count+1,started_at=COALESCE(started_at,now()),execution_lease_token=p_token,execution_lease_owner='render-worker',execution_lease_expires_at=clock_timestamp()+interval '60 seconds',execution_heartbeat_at=clock_timestamp() WHERE id=p_job;
 RETURN jsonb_build_object('acquired',true);
END $$;
