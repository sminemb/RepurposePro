-- Consistent project/job lock order and validated per-clip publication.

--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.begin_clip_render_item(p_job uuid,p_token uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog,public,pg_temp AS $$
DECLARE item public.render_request_items;
BEGIN
 PERFORM 1 FROM public.projects p JOIN public.processing_jobs j ON j.project_id=p.id WHERE j.id=p_job AND p.current_job_id=p_job AND p.deleted_at IS NULL FOR UPDATE OF p;
 IF NOT FOUND OR p_token IS NULL THEN RETURN NULL; END IF;
 PERFORM 1 FROM public.processing_jobs WHERE id=p_job AND type='render_clips' AND status='active' AND execution_lease_token=p_token AND execution_lease_expires_at>clock_timestamp() FOR UPDATE;
 IF NOT FOUND THEN RETURN NULL; END IF;
 UPDATE public.render_item_progress SET status='failed',step='failed',error_code='RENDER_RETRY_LIMIT',error_message='This clip could not be exported after two attempts.' WHERE job_id=p_job AND status='queued' AND attempt_count>=2;
 SELECT r.* INTO item FROM public.render_request_items r JOIN public.render_item_progress x USING(job_id,clip_id) WHERE r.job_id=p_job AND x.status='queued' AND x.attempt_count<2 AND x.attempt_count<(SELECT attempt_count FROM public.processing_jobs WHERE id=p_job) ORDER BY x.attempt_count,r.ordinal LIMIT 1 FOR UPDATE OF x;
 IF NOT FOUND THEN IF public.finish_clip_batch(p_job) THEN RETURN NULL; END IF; RETURN jsonb_build_object('retry',true); END IF;
 UPDATE public.render_item_progress SET status='active',step='preparing',progress=2,attempt_count=attempt_count+1,error_code=NULL,error_message=NULL WHERE job_id=p_job AND clip_id=item.clip_id;
 RETURN item.snapshot;
END $$;


--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.fail_clip_render_item(p_job uuid,p_token uuid,p_clip uuid,p_retry boolean,p_code text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog,public,pg_temp AS $$
BEGIN
 PERFORM 1 FROM public.projects p JOIN public.processing_jobs j ON j.project_id=p.id WHERE j.id=p_job AND p.current_job_id=p_job AND p.deleted_at IS NULL FOR UPDATE OF p;
 IF NOT FOUND OR p_token IS NULL THEN RETURN false; END IF;
 PERFORM 1 FROM public.processing_jobs WHERE id=p_job AND type='render_clips' AND status='active' AND execution_lease_token=p_token AND execution_lease_expires_at>clock_timestamp() FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 UPDATE public.render_item_progress SET status=CASE WHEN p_retry AND attempt_count<2 THEN 'queued' ELSE 'failed' END,step=CASE WHEN p_retry AND attempt_count<2 THEN 'queued' ELSE 'failed' END,progress=0,error_code=CASE WHEN p_code='RENDER_SOURCE_UNAVAILABLE' THEN p_code ELSE 'RENDER_FAILED' END,error_message='This clip could not be exported. Its saved edits are safe; try again.' WHERE job_id=p_job AND clip_id=p_clip AND status='active';
 IF NOT FOUND THEN RETURN false; END IF;
 PERFORM public.finish_clip_batch(p_job); RETURN true;
END $$;

--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.complete_clip_render_item(p_job uuid,p_token uuid,p_clip uuid,p_output jsonb,p_retention integer) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog,public,pg_temp AS $$
DECLARE j public.processing_jobs; r public.render_request_items; v_output_id uuid;
BEGIN
 IF p_token IS NULL OR p_retention IS NULL OR p_output IS NULL OR jsonb_typeof(p_output)<>'object'
 OR NOT p_output ?& ARRAY['storagePath','fileName','fileSizeBytes','durationSeconds']
 OR jsonb_typeof(p_output->'storagePath') IS DISTINCT FROM 'string' OR jsonb_typeof(p_output->'fileName') IS DISTINCT FROM 'string'
 OR jsonb_typeof(p_output->'fileSizeBytes') IS DISTINCT FROM 'number' OR jsonb_typeof(p_output->'durationSeconds') IS DISTINCT FROM 'number'
 OR p_output->>'fileSizeBytes' !~ '^[0-9]+$' OR (p_output->>'fileSizeBytes')::numeric NOT BETWEEN 1 AND 9007199254740991
 OR (p_output->>'durationSeconds')::numeric<=0 OR length(p_output->>'storagePath') NOT BETWEEN 1 AND 4096
 OR p_output->>'fileName' !~ '^[a-zA-Z0-9._-]{1,150}$' THEN RETURN NULL; END IF;
 SELECT * INTO j FROM public.processing_jobs WHERE id=p_job AND type='render_clips';
 PERFORM 1 FROM public.projects WHERE id=j.project_id AND current_job_id=p_job AND deleted_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RETURN NULL; END IF;
 SELECT * INTO j FROM public.processing_jobs WHERE id=p_job FOR UPDATE;
 SELECT id INTO v_output_id FROM public.rendered_outputs WHERE render_job_id=p_job AND clip_candidate_id=p_clip AND storage_path=p_output->>'storagePath';
 IF v_output_id IS NOT NULL AND p_output->>'storagePath' LIKE '%/'||p_job::text||'/'||p_clip::text||'/'||p_token::text||'.mp4' THEN RETURN v_output_id; END IF;
 IF j.status<>'active' OR j.execution_lease_token IS DISTINCT FROM p_token OR j.execution_lease_expires_at IS NULL OR j.execution_lease_expires_at<=clock_timestamp() OR p_retention NOT BETWEEN 1 AND 365 OR p_output->>'storagePath' NOT LIKE '%/'||p_job::text||'/'||p_clip::text||'/'||p_token::text||'.mp4' THEN RETURN NULL; END IF;
 PERFORM 1 FROM public.render_item_progress WHERE job_id=p_job AND clip_id=p_clip AND status='active';
 IF NOT FOUND THEN RETURN NULL; END IF;
 SELECT * INTO r FROM public.render_request_items WHERE job_id=p_job AND clip_id=p_clip;
 IF abs((p_output->>'durationSeconds')::numeric-((r.snapshot#>>'{clip,endTime}')::numeric-(r.snapshot#>>'{clip,startTime}')::numeric))>0.12 THEN RETURN NULL; END IF;
 INSERT INTO public.rendered_outputs(project_id,render_job_id,clip_candidate_id,title,storage_path,file_name,file_size_bytes,duration_seconds,width,height,video_codec,audio_codec,expires_at)
 VALUES(j.project_id,p_job,p_clip,r.snapshot#>>'{clip,title}',p_output->>'storagePath',p_output->>'fileName',(p_output->>'fileSizeBytes')::bigint,(p_output->>'durationSeconds')::numeric,1080,1920,'h264','aac',clock_timestamp()+make_interval(days=>p_retention)) RETURNING id INTO v_output_id;
 UPDATE public.render_item_progress SET status='completed',step='completed',progress=100,output_id=v_output_id,error_code=NULL,error_message=NULL WHERE job_id=p_job AND clip_id=p_clip;
 PERFORM public.finish_clip_batch(p_job); RETURN v_output_id;
END $$;
