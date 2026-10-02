-- Validate at the same millisecond precision used by persisted ranges and FFmpeg.
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.finalize_summary_preview(p_job uuid,p_worker text,p_token uuid,p_segments jsonb) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog,public,pg_temp AS $$
DECLARE p public.projects; j public.processing_jobs; v public.uploaded_videos; n integer; total numeric;
BEGIN
 SELECT p0.* INTO p FROM public.projects p0 JOIN public.processing_jobs j0 ON j0.project_id=p0.id WHERE j0.id=p_job FOR UPDATE OF p0;
 IF NOT FOUND OR p.deleted_at IS NOT NULL OR p.output_type<>'summary' OR p.current_analysis_job_id<>p_job THEN RETURN 'rejected'; END IF;
 IF public.is_analysis_preview_ready(p_job,p.id) THEN RETURN 'existing'; END IF;
 SELECT * INTO j FROM public.processing_jobs WHERE id=p_job FOR UPDATE;
 IF j.type<>'analyze_video' OR j.status<>'active' OR j.execution_lease_owner IS DISTINCT FROM p_worker OR j.execution_lease_token IS DISTINCT FROM p_token OR j.execution_lease_expires_at<=clock_timestamp() THEN RETURN 'lost'; END IF;
 SELECT v0.* INTO v FROM public.uploaded_videos v0 JOIN public.transcripts t ON t.uploaded_video_id=v0.id WHERE t.processing_job_id=p_job AND v0.project_id=p.id AND v0.deleted_at IS NULL;
 IF NOT FOUND THEN RETURN 'rejected'; END IF;
 IF p_segments IS NULL OR jsonb_typeof(p_segments)<>'array' OR octet_length(p_segments::text)>1048576 THEN RETURN 'rejected'; END IF;
 n:=jsonb_array_length(p_segments);
 IF n NOT BETWEEN 1 AND 100 OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_segments) x WHERE jsonb_typeof(x)<>'object' OR jsonb_typeof(x->'startTime') IS DISTINCT FROM 'number' OR jsonb_typeof(x->'endTime') IS DISTINCT FROM 'number' OR jsonb_typeof(x->'reason') IS DISTINCT FROM 'string' OR length(btrim(x->>'reason')) NOT BETWEEN 1 AND 500) THEN RETURN 'rejected'; END IF;
 IF EXISTS(SELECT 1 FROM (SELECT round((x->>'startTime')::numeric,3) a,round((x->>'endTime')::numeric,3) b,lag(round((x->>'endTime')::numeric,3)) OVER(ORDER BY ord) previous FROM jsonb_array_elements(p_segments) WITH ORDINALITY g(x,ord)) ranges WHERE a<0 OR b<=a OR b>v.duration_seconds OR a<previous) THEN RETURN 'rejected'; END IF;
 SELECT sum(round((x->>'endTime')::numeric,3)-round((x->>'startTime')::numeric,3)) INTO total FROM jsonb_array_elements(p_segments) x;
 IF total<v.duration_seconds*.08-0.001 OR total>v.duration_seconds*.12+0.001 THEN RETURN 'rejected'; END IF;
 INSERT INTO public.summaries(analysis_job_id,project_id,source_id,target_duration_seconds) VALUES(j.id,p.id,v.id,v.duration_seconds*.1);
 INSERT INTO public.summary_segments(analysis_job_id,segment_order,start_time,end_time,reason) SELECT j.id,ord-1,round((x->>'startTime')::numeric,3),round((x->>'endTime')::numeric,3),btrim(x->>'reason') FROM jsonb_array_elements(p_segments) WITH ORDINALITY g(x,ord);
 UPDATE public.processing_jobs SET analysis_prompt_version='summary-v1',status='completed',step='preview_ready',progress=100,completed_at=clock_timestamp(),execution_lease_token=NULL,execution_lease_owner=NULL,execution_lease_expires_at=NULL,execution_heartbeat_at=NULL,error_code=NULL,error_message=NULL,updated_at=now() WHERE id=j.id;
 UPDATE public.projects SET status='preview_ready',updated_at=now() WHERE id=p.id;
 RETURN 'created';
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.save_owned_summary(p_user text,p_project uuid,p_revision integer,p_segments jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog,public,pg_temp AS $$
DECLARE p public.projects; s public.summaries; duration numeric; n integer;
BEGIN
 SELECT * INTO p FROM public.projects WHERE id=p_project AND user_id=p_user AND deleted_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('error','PROJECT_NOT_FOUND'); END IF;
 SELECT * INTO s FROM public.summaries WHERE analysis_job_id=p.current_analysis_job_id AND project_id=p.id FOR UPDATE;
 IF NOT FOUND OR p.output_type<>'summary' THEN RETURN jsonb_build_object('error','SUMMARY_NOT_FOUND'); END IF;
 IF p_revision IS DISTINCT FROM s.edit_revision THEN RETURN jsonb_build_object('error','SUMMARY_EDIT_CONFLICT'); END IF;
 SELECT duration_seconds INTO duration FROM public.uploaded_videos WHERE id=s.source_id;
 IF p_segments IS NULL OR jsonb_typeof(p_segments)<>'array' OR octet_length(p_segments::text)>1048576 THEN RETURN jsonb_build_object('error','VALIDATION_ERROR'); END IF;
 n:=jsonb_array_length(p_segments);
 IF n NOT BETWEEN 1 AND 100 OR n<>(SELECT count(*) FROM public.summary_segments WHERE analysis_job_id=s.analysis_job_id) OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_segments) x WHERE jsonb_typeof(x->'id') IS DISTINCT FROM 'string' OR jsonb_typeof(x->'startTime') IS DISTINCT FROM 'number' OR jsonb_typeof(x->'endTime') IS DISTINCT FROM 'number' OR jsonb_typeof(x->'selected') IS DISTINCT FROM 'boolean') THEN RETURN jsonb_build_object('error','VALIDATION_ERROR'); END IF;
 IF (SELECT count(DISTINCT (x->>'id')::uuid) FROM jsonb_array_elements(p_segments) x)<>n OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_segments) x WHERE NOT EXISTS(SELECT 1 FROM public.summary_segments g WHERE g.id=(x->>'id')::uuid AND g.analysis_job_id=s.analysis_job_id)) THEN RETURN jsonb_build_object('error','VALIDATION_ERROR'); END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_segments) x WHERE round((x->>'startTime')::numeric,3)<0 OR round((x->>'endTime')::numeric,3)<=round((x->>'startTime')::numeric,3) OR round((x->>'endTime')::numeric,3)>duration) OR EXISTS(SELECT 1 FROM (SELECT round((x->>'startTime')::numeric,3) a,lag(round((x->>'endTime')::numeric,3)) OVER(ORDER BY g.segment_order) previous FROM jsonb_array_elements(p_segments) x JOIN public.summary_segments g ON g.id=(x->>'id')::uuid WHERE (x->>'selected')::boolean) ranges WHERE a<previous) THEN RETURN jsonb_build_object('error','SUMMARY_INVALID_RANGES'); END IF;
 UPDATE public.summary_segments g SET start_time=round((x->>'startTime')::numeric,3),end_time=round((x->>'endTime')::numeric,3),selected=(x->>'selected')::boolean,updated_at=now() FROM jsonb_array_elements(p_segments) x WHERE g.id=(x->>'id')::uuid AND g.analysis_job_id=s.analysis_job_id;
 UPDATE public.summaries SET edit_revision=edit_revision+1 WHERE analysis_job_id=s.analysis_job_id;
 RETURN public.summary_json(s.analysis_job_id);
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN RETURN jsonb_build_object('error','VALIDATION_ERROR'); END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.complete_summary_render(p_job uuid,p_token uuid,p_output jsonb,p_days integer) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog,public,pg_temp AS $$
DECLARE p public.projects; j public.processing_jobs; r public.summary_render_requests; output_id uuid; expected numeric;
BEGIN
 SELECT p0.* INTO p FROM public.projects p0 JOIN public.processing_jobs j0 ON j0.project_id=p0.id WHERE j0.id=p_job FOR UPDATE OF p0;
 SELECT * INTO j FROM public.processing_jobs WHERE id=p_job AND type='render_summary' FOR UPDATE;
 IF NOT FOUND OR p_token IS NULL OR p.deleted_at IS NOT NULL THEN RETURN NULL; END IF;
 SELECT * INTO r FROM public.summary_render_requests WHERE job_id=j.id;
 IF j.status='completed' THEN RETURN (SELECT id FROM public.rendered_outputs WHERE render_job_id=j.id AND storage_path=p_output->>'storagePath'); END IF;
 IF j.status<>'active' OR j.execution_lease_token IS DISTINCT FROM p_token OR j.execution_lease_expires_at<=clock_timestamp() OR p.current_job_id<>j.id THEN RETURN NULL; END IF;
 SELECT sum((x->>'endTime')::numeric-(x->>'startTime')::numeric) INTO expected FROM jsonb_array_elements(r.snapshot->'segments') x;
 IF p_days IS NULL OR p_days NOT BETWEEN 1 AND 365 OR p_output IS NULL OR jsonb_typeof(p_output)<>'object' OR jsonb_typeof(p_output->'storagePath') IS DISTINCT FROM 'string' OR length(p_output->>'storagePath')=0 OR jsonb_typeof(p_output->'fileName') IS DISTINCT FROM 'string' OR (p_output->>'fileName') !~ '^[a-zA-Z0-9._-]+\.mp4$' OR jsonb_typeof(p_output->'fileSizeBytes') IS DISTINCT FROM 'number' OR (p_output->>'fileSizeBytes') !~ '^[0-9]+$' OR (p_output->>'fileSizeBytes')::bigint<=0 OR jsonb_typeof(p_output->'durationSeconds') IS DISTINCT FROM 'number' OR abs((p_output->>'durationSeconds')::numeric-expected)>GREATEST(.12,jsonb_array_length(r.snapshot->'segments')*.034+.05) OR jsonb_typeof(p_output->'width') IS DISTINCT FROM 'number' OR jsonb_typeof(p_output->'height') IS DISTINCT FROM 'number' OR (p_output->>'width') !~ '^[0-9]+$' OR (p_output->>'height') !~ '^[0-9]+$' OR p_output->>'videoCodec' IS DISTINCT FROM 'h264' OR p_output->>'audioCodec' IS DISTINCT FROM 'aac' THEN RETURN NULL; END IF;
 INSERT INTO public.rendered_outputs(project_id,render_job_id,type,title,storage_path,file_name,file_size_bytes,duration_seconds,width,height,video_codec,audio_codec,expires_at) VALUES(p.id,j.id,'summary',r.snapshot->>'title',p_output->>'storagePath',p_output->>'fileName',(p_output->>'fileSizeBytes')::bigint,(p_output->>'durationSeconds')::numeric,(p_output->>'width')::integer,(p_output->>'height')::integer,'h264','aac',clock_timestamp()+make_interval(days=>p_days)) RETURNING id INTO output_id;
 UPDATE public.processing_jobs SET status='completed',step='completed',progress=100,completed_at=now(),execution_lease_token=NULL,execution_lease_owner=NULL,execution_lease_expires_at=NULL,execution_heartbeat_at=NULL,error_code=NULL,error_message=NULL WHERE id=j.id;
 UPDATE public.projects SET status='completed' WHERE id=p.id;
 RETURN output_id;
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range OR check_violation THEN RETURN NULL;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.finish_render_dispatch(p_job uuid,p_token uuid,p_published boolean) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog, public, pg_temp AS $$
BEGIN
  UPDATE public.processing_job_dispatches SET status=CASE WHEN p_published THEN 'published'::public.processing_dispatch_status ELSE status END,
    published_at=CASE WHEN p_published THEN COALESCE(published_at,now()) ELSE published_at END,bullmq_job_id=CASE WHEN p_published THEN p_job::text ELSE bullmq_job_id END,
    next_attempt_at=clock_timestamp()+CASE WHEN p_published THEN interval '15 seconds' ELSE interval '3 seconds' END,lease_token=NULL,lease_owner=NULL,lease_expires_at=NULL
  WHERE processing_job_id=p_job AND lease_token=p_token;
  IF NOT FOUND THEN RETURN false; END IF;
  IF p_published THEN UPDATE public.processing_jobs SET bullmq_job_id=p_job::text WHERE id=p_job AND type IN ('render_clips','render_summary'); END IF;
  RETURN true;
END $$;
