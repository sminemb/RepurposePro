ALTER TABLE "render_request_keys" DROP CONSTRAINT "render_request_keys_job_id_render_requests_job_id_fk";
--> statement-breakpoint
ALTER TABLE "render_request_keys" ADD CONSTRAINT "render_request_keys_job_id_processing_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."processing_jobs"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.acquire_summary_render(p_job uuid,p_project uuid,p_token uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog,public,pg_temp AS $$
DECLARE p public.projects; j public.processing_jobs;
BEGIN
 IF p_token IS NULL THEN RETURN NULL; END IF;
 SELECT * INTO p FROM public.projects WHERE id=p_project AND deleted_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RETURN NULL; END IF;
 SELECT * INTO j FROM public.processing_jobs WHERE id=p_job AND project_id=p.id AND type='render_summary' FOR UPDATE;
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF j.status IN ('completed','failed') THEN RETURN jsonb_build_object('terminal',true); END IF;
 IF p.current_job_id<>j.id OR j.execution_lease_expires_at>clock_timestamp() THEN RETURN NULL; END IF;
 IF j.attempt_count>=2 THEN
  UPDATE public.processing_jobs SET status='failed',step='failed',error_code='RENDER_FAILED',error_message='Summary export failed. Your saved edits are safe.',completed_at=now(),execution_lease_token=NULL,execution_lease_owner=NULL,execution_lease_expires_at=NULL,execution_heartbeat_at=NULL WHERE id=j.id;
  UPDATE public.projects SET status='preview_ready' WHERE id=p.id;
  RETURN jsonb_build_object('terminal',true);
 END IF;
 UPDATE public.processing_jobs SET status='active',step='preparing',progress=1,attempt_count=attempt_count+1,started_at=COALESCE(started_at,now()),execution_lease_token=p_token,execution_lease_owner='summary-renderer',execution_lease_expires_at=clock_timestamp()+interval '60 seconds',execution_heartbeat_at=clock_timestamp() WHERE id=j.id;
 RETURN (SELECT snapshot FROM public.summary_render_requests WHERE job_id=j.id);
END $$;
