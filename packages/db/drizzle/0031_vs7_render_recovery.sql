-- Compatibility with in-flight single-clip workers and retry recovery.
CREATE OR REPLACE FUNCTION public.fail_clip_render(p_job uuid,p_token uuid,p_retry boolean,p_code text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog,public,pg_temp AS $$
DECLARE j public.processing_jobs;
BEGIN
 SELECT * INTO j FROM public.processing_jobs WHERE id=p_job AND type='render_clips';
 IF NOT FOUND THEN RETURN false; END IF;
 PERFORM 1 FROM public.projects WHERE id=j.project_id FOR UPDATE;
 SELECT * INTO j FROM public.processing_jobs WHERE id=p_job FOR UPDATE;
 IF j.status NOT IN ('queued','active') OR (p_token IS NOT NULL AND (j.execution_lease_token IS DISTINCT FROM p_token OR j.execution_lease_expires_at<=clock_timestamp())) OR (p_token IS NULL AND j.execution_lease_expires_at>clock_timestamp()) THEN RETURN false; END IF;
 UPDATE public.render_item_progress SET status=CASE WHEN p_retry AND attempt_count<2 THEN 'queued' ELSE 'failed' END,step=CASE WHEN p_retry AND attempt_count<2 THEN 'queued' ELSE 'failed' END,error_code=p_code,error_message='This clip could not be exported. Your saved edits are safe; try again.' WHERE job_id=p_job AND (status='active' OR (NOT p_retry AND status='queued'));
 IF public.finish_clip_batch(p_job) THEN RETURN true; END IF;
 UPDATE public.processing_jobs SET status='queued',step='queued',execution_lease_token=NULL,execution_lease_owner=NULL,execution_lease_expires_at=NULL,execution_heartbeat_at=NULL WHERE id=p_job;
 RETURN true;
END $$;
--> statement-breakpoint
ALTER FUNCTION public.acquire_clip_render(uuid,uuid,uuid) RENAME TO acquire_clip_render_v6;
--> statement-breakpoint
CREATE FUNCTION public.acquire_clip_render(p_job uuid,p_project uuid,p_token uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog,public,pg_temp AS $$
DECLARE snap jsonb;
BEGIN
 IF (SELECT count(*) FROM public.render_request_items WHERE job_id=p_job)<>1 THEN RETURN NULL; END IF;
 snap:=public.acquire_clip_render_v6(p_job,p_project,p_token);
 IF snap ? 'clip' THEN UPDATE public.render_item_progress SET status='active',step='preparing',attempt_count=(SELECT LEAST(attempt_count,2) FROM public.processing_jobs WHERE id=p_job) WHERE job_id=p_job; END IF;
 RETURN snap;
END $$;
--> statement-breakpoint
ALTER FUNCTION public.complete_clip_render(uuid,uuid,jsonb,integer) RENAME TO complete_clip_render_v6;
--> statement-breakpoint
CREATE FUNCTION public.complete_clip_render(p_job uuid,p_token uuid,p_output jsonb,p_retention integer) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog,public,pg_temp AS $$
DECLARE output uuid;
BEGIN
 IF (SELECT count(*) FROM public.render_request_items WHERE job_id=p_job)<>1 THEN RETURN NULL; END IF;
 output:=public.complete_clip_render_v6(p_job,p_token,p_output,p_retention);
 IF output IS NOT NULL THEN UPDATE public.render_item_progress SET status='completed',step='completed',progress=100,output_id=output,error_code=NULL,error_message=NULL WHERE job_id=p_job; END IF;
 RETURN output;
END $$;

--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.begin_clip_render_item(p_job uuid,p_token uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog,public,pg_temp AS $$
DECLARE item public.render_request_items;
BEGIN
 PERFORM 1 FROM public.processing_jobs WHERE id=p_job AND type='render_clips' AND status='active' AND execution_lease_token=p_token AND execution_lease_expires_at>clock_timestamp() FOR UPDATE;
 IF NOT FOUND THEN RETURN NULL; END IF;
 UPDATE public.render_item_progress SET status='failed',step='failed',error_code='RENDER_RETRY_LIMIT',error_message='This clip could not be exported after two attempts.' WHERE job_id=p_job AND status='queued' AND attempt_count>=2;
 SELECT r.* INTO item FROM public.render_request_items r JOIN public.render_item_progress x USING(job_id,clip_id) WHERE r.job_id=p_job AND x.status='queued' AND x.attempt_count<2 AND x.attempt_count<(SELECT attempt_count FROM public.processing_jobs WHERE id=p_job) ORDER BY x.attempt_count,r.ordinal LIMIT 1 FOR UPDATE OF x;
 IF NOT FOUND THEN IF public.finish_clip_batch(p_job) THEN RETURN NULL; END IF; RETURN jsonb_build_object('retry',true); END IF;
 UPDATE public.render_item_progress SET status='active',step='preparing',progress=2,attempt_count=attempt_count+1,error_code=NULL,error_message=NULL WHERE job_id=p_job AND clip_id=item.clip_id;
 RETURN item.snapshot;
END $$;

--> statement-breakpoint
ALTER FUNCTION public.acquire_clip_render(uuid,uuid,uuid) OWNER TO repurposepro_owner;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.acquire_clip_render(uuid,uuid,uuid) FROM PUBLIC,repurposepro_runtime,repurposepro_checkout,repurposepro_webhook;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.acquire_clip_render(uuid,uuid,uuid) TO repurposepro_processing;
--> statement-breakpoint
ALTER FUNCTION public.complete_clip_render(uuid,uuid,jsonb,integer) OWNER TO repurposepro_owner;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.complete_clip_render(uuid,uuid,jsonb,integer) FROM PUBLIC,repurposepro_runtime,repurposepro_checkout,repurposepro_webhook;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.complete_clip_render(uuid,uuid,jsonb,integer) TO repurposepro_processing;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.acquire_clip_render_v6(uuid,uuid,uuid),public.complete_clip_render_v6(uuid,uuid,jsonb,integer) FROM PUBLIC,repurposepro_runtime,repurposepro_processing,repurposepro_checkout,repurposepro_webhook;
