-- Summary writes are available only through owned and lease-fenced functions.
REVOKE ALL ON public.summaries,public.summary_segments,public.summary_render_requests FROM PUBLIC,repurposepro_runtime,repurposepro_processing,repurposepro_checkout,repurposepro_webhook;
--> statement-breakpoint
CREATE FUNCTION public.analysis_output_type(p_job uuid,p_worker text,p_token uuid) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO pg_catalog,public,pg_temp AS $$
 SELECT p.output_type::text FROM public.projects p JOIN public.processing_jobs j ON j.project_id=p.id WHERE j.id=p_job AND j.type='analyze_video' AND j.status='active' AND j.execution_lease_owner=p_worker AND j.execution_lease_token=p_token AND j.execution_lease_expires_at>clock_timestamp() AND p.current_analysis_job_id=j.id AND p.deleted_at IS NULL;
$$;
--> statement-breakpoint
CREATE FUNCTION public.summary_json(p_analysis uuid) RETURNS jsonb LANGUAGE sql STABLE SET search_path TO pg_catalog,public,pg_temp AS $$
 SELECT jsonb_build_object('analysisJobId',s.analysis_job_id,'revision',s.edit_revision,'sourceDurationSeconds',v.duration_seconds,'targetDurationSeconds',s.target_duration_seconds,'currentDurationSeconds',COALESCE(sum(g.end_time-g.start_time) FILTER(WHERE g.selected),0),'segments',jsonb_agg(jsonb_build_object('id',g.id,'order',g.segment_order,'startTime',g.start_time,'endTime',g.end_time,'reason',g.reason,'selected',g.selected,'durationSeconds',g.end_time-g.start_time) ORDER BY g.segment_order)) FROM public.summaries s JOIN public.uploaded_videos v ON v.id=s.source_id JOIN public.summary_segments g ON g.analysis_job_id=s.analysis_job_id WHERE s.analysis_job_id=p_analysis GROUP BY s.analysis_job_id,v.id;
$$;
--> statement-breakpoint
CREATE FUNCTION public.get_owned_summary(p_user text,p_project uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO pg_catalog,public,pg_temp AS $$
 SELECT public.summary_json(p.current_analysis_job_id) FROM public.projects p WHERE p.id=p_project AND p.user_id=p_user AND p.output_type='summary' AND p.deleted_at IS NULL;
$$;
--> statement-breakpoint
ALTER FUNCTION public.is_analysis_preview_ready(uuid,uuid) RENAME TO is_clip_analysis_preview_ready;
--> statement-breakpoint
CREATE FUNCTION public.is_analysis_preview_ready(p_job uuid,p_project uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO pg_catalog,public,pg_temp AS $$
 SELECT public.is_clip_analysis_preview_ready(p_job,p_project) OR EXISTS(SELECT 1 FROM public.summaries s JOIN public.processing_jobs j ON j.id=s.analysis_job_id JOIN public.projects p ON p.id=s.project_id WHERE j.id=p_job AND p.id=p_project AND p.current_analysis_job_id=j.id AND p.deleted_at IS NULL AND j.type='analyze_video' AND j.status='completed' AND j.step='preview_ready' AND j.progress=100 AND j.analysis_prompt_version='summary-v1' AND j.execution_lease_token IS NULL AND EXISTS(SELECT 1 FROM public.summary_segments g WHERE g.analysis_job_id=j.id));
$$;
--> statement-breakpoint
CREATE FUNCTION public.finalize_summary_preview(p_job uuid,p_worker text,p_token uuid,p_segments jsonb) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog,public,pg_temp AS $$
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
 IF EXISTS(SELECT 1 FROM (SELECT (x->>'startTime')::numeric a,(x->>'endTime')::numeric b,lag((x->>'endTime')::numeric) OVER(ORDER BY ord) previous FROM jsonb_array_elements(p_segments) WITH ORDINALITY g(x,ord)) ranges WHERE a<0 OR b<=a OR b>v.duration_seconds OR a<previous) THEN RETURN 'rejected'; END IF;
 SELECT sum((x->>'endTime')::numeric-(x->>'startTime')::numeric) INTO total FROM jsonb_array_elements(p_segments) x;
 IF total<v.duration_seconds*.08-0.001 OR total>v.duration_seconds*.12+0.001 THEN RETURN 'rejected'; END IF;
 INSERT INTO public.summaries(analysis_job_id,project_id,source_id,target_duration_seconds) VALUES(j.id,p.id,v.id,v.duration_seconds*.1);
 INSERT INTO public.summary_segments(analysis_job_id,segment_order,start_time,end_time,reason) SELECT j.id,ord-1,(x->>'startTime')::numeric,(x->>'endTime')::numeric,btrim(x->>'reason') FROM jsonb_array_elements(p_segments) WITH ORDINALITY g(x,ord);
 UPDATE public.processing_jobs SET analysis_prompt_version='summary-v1',status='completed',step='preview_ready',progress=100,completed_at=clock_timestamp(),execution_lease_token=NULL,execution_lease_owner=NULL,execution_lease_expires_at=NULL,execution_heartbeat_at=NULL,error_code=NULL,error_message=NULL,updated_at=now() WHERE id=j.id;
 UPDATE public.projects SET status='preview_ready',updated_at=now() WHERE id=p.id;
 RETURN 'created';
END $$;
--> statement-breakpoint
CREATE FUNCTION public.save_owned_summary(p_user text,p_project uuid,p_revision integer,p_segments jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog,public,pg_temp AS $$
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
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_segments) x WHERE (x->>'startTime')::numeric<0 OR (x->>'endTime')::numeric<=(x->>'startTime')::numeric OR (x->>'endTime')::numeric>duration) OR EXISTS(SELECT 1 FROM (SELECT (x->>'startTime')::numeric a,lag((x->>'endTime')::numeric) OVER(ORDER BY g.segment_order) previous FROM jsonb_array_elements(p_segments) x JOIN public.summary_segments g ON g.id=(x->>'id')::uuid WHERE (x->>'selected')::boolean) ranges WHERE a<previous) THEN RETURN jsonb_build_object('error','SUMMARY_INVALID_RANGES'); END IF;
 UPDATE public.summary_segments g SET start_time=(x->>'startTime')::numeric,end_time=(x->>'endTime')::numeric,selected=(x->>'selected')::boolean,updated_at=now() FROM jsonb_array_elements(p_segments) x WHERE g.id=(x->>'id')::uuid AND g.analysis_job_id=s.analysis_job_id;
 UPDATE public.summaries SET edit_revision=edit_revision+1 WHERE analysis_job_id=s.analysis_job_id;
 RETURN public.summary_json(s.analysis_job_id);
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN RETURN jsonb_build_object('error','VALIDATION_ERROR'); END $$;
--> statement-breakpoint
CREATE TRIGGER summary_render_request_immutable BEFORE UPDATE ON public.summary_render_requests FOR EACH ROW EXECUTE FUNCTION public.protect_render_request();
--> statement-breakpoint
CREATE FUNCTION public.start_owned_summary_render(p_user text,p_project uuid,p_revision integer,p_key text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog,public,pg_temp AS $$
DECLARE p public.projects; s public.summaries; v public.uploaded_videos; j public.processing_jobs; r public.summary_render_requests; existing uuid; ranges jsonb; new_job uuid;
BEGIN
 SELECT * INTO p FROM public.projects WHERE id=p_project AND user_id=p_user AND deleted_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('error','PROJECT_NOT_FOUND'); END IF;
 IF p.output_type<>'summary' OR p_key IS NULL OR p_key !~ '^[a-zA-Z0-9_-]{1,100}$' OR p_revision IS NULL OR p_revision<0 THEN RETURN jsonb_build_object('error','VALIDATION_ERROR'); END IF;
 SELECT job_id INTO existing FROM public.render_request_keys WHERE project_id=p.id AND idempotency_key=p_key;
 IF existing IS NOT NULL THEN
  SELECT * INTO r FROM public.summary_render_requests WHERE job_id=existing;
  IF NOT FOUND OR r.revision<>p_revision OR r.analysis_job_id<>p.current_analysis_job_id THEN RETURN jsonb_build_object('error','RENDER_IDEMPOTENCY_CONFLICT'); END IF;
  SELECT * INTO j FROM public.processing_jobs WHERE id=existing;
  RETURN jsonb_build_object('jobId',j.id,'status',j.status,'outputCount',1);
 END IF;
 SELECT * INTO s FROM public.summaries WHERE analysis_job_id=p.current_analysis_job_id AND project_id=p.id FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('error','SUMMARY_NOT_FOUND'); END IF;
 IF s.edit_revision<>p_revision THEN RETURN jsonb_build_object('error','SUMMARY_EDIT_CONFLICT'); END IF;
 SELECT * INTO v FROM public.uploaded_videos WHERE id=s.source_id AND project_id=p.id AND deleted_at IS NULL;
 IF NOT FOUND THEN RETURN jsonb_build_object('error','SOURCE_VIDEO_NOT_FOUND'); END IF;
 IF v.expires_at<=clock_timestamp() THEN RETURN jsonb_build_object('error','SOURCE_VIDEO_EXPIRED'); END IF;
 SELECT jsonb_agg(jsonb_build_object('startTime',start_time,'endTime',end_time) ORDER BY segment_order) INTO ranges FROM public.summary_segments WHERE analysis_job_id=s.analysis_job_id AND selected;
 IF ranges IS NULL THEN RETURN jsonb_build_object('error','SUMMARY_EMPTY_SELECTION'); END IF;
 SELECT * INTO j FROM public.processing_jobs WHERE project_id=p.id AND status IN ('queued','active') LIMIT 1;
 IF FOUND THEN
  SELECT * INTO r FROM public.summary_render_requests WHERE job_id=j.id;
  IF j.type='render_summary' AND r.revision=p_revision AND r.analysis_job_id=s.analysis_job_id THEN
   INSERT INTO public.render_request_keys(project_id,idempotency_key,job_id) VALUES(p.id,p_key,j.id);
   RETURN jsonb_build_object('jobId',j.id,'status',j.status,'outputCount',1);
  END IF;
  RETURN jsonb_build_object('error','RENDER_ALREADY_RUNNING');
 END IF;
 IF p.status NOT IN ('preview_ready','waiting_for_user_edits','completed') THEN RETURN jsonb_build_object('error','RENDER_INVALID_PROJECT_STATE'); END IF;
 INSERT INTO public.processing_jobs(project_id,user_id,type,status,step,progress,credits_charged,refund_eligible) VALUES(p.id,p.user_id,'render_summary','queued','queued',0,0,false) RETURNING id INTO new_job;
 INSERT INTO public.summary_render_requests(job_id,project_id,analysis_job_id,revision,snapshot) VALUES(new_job,p.id,s.analysis_job_id,p_revision,jsonb_build_object('segments',ranges,'sourceId',v.id,'sourcePath',v.storage_path,'sourceExpiresAt',v.expires_at,'sourceFileSizeBytes',v.file_size_bytes,'projectId',p.id,'userId',p.user_id,'title',p.name));
 INSERT INTO public.render_request_keys(project_id,idempotency_key,job_id) VALUES(p.id,p_key,new_job);
 INSERT INTO public.processing_job_dispatches(processing_job_id) VALUES(new_job);
 UPDATE public.projects SET current_job_id=new_job,status='rendering',updated_at=now() WHERE id=p.id;
 RETURN jsonb_build_object('jobId',new_job,'status','queued','outputCount',1);
END $$;
--> statement-breakpoint
CREATE FUNCTION public.acquire_summary_render(p_job uuid,p_project uuid,p_token uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog,public,pg_temp AS $$
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
  UPDATE public.processing_jobs SET status='failed',step='failed',error_code='RENDER_FAILED',error_message='Summary export failed. Your saved edits are safe.',completed_at=now(),execution_lease_token=NULL,execution_lease_expires_at=NULL WHERE id=j.id;
  UPDATE public.projects SET status='preview_ready' WHERE id=p.id;
  RETURN jsonb_build_object('terminal',true);
 END IF;
 UPDATE public.processing_jobs SET status='active',step='preparing',progress=1,attempt_count=attempt_count+1,started_at=COALESCE(started_at,now()),execution_lease_token=p_token,execution_lease_expires_at=clock_timestamp()+interval '60 seconds',execution_heartbeat_at=clock_timestamp() WHERE id=j.id;
 RETURN (SELECT snapshot FROM public.summary_render_requests WHERE job_id=j.id);
END $$;
--> statement-breakpoint
CREATE FUNCTION public.touch_summary_render(p_job uuid,p_token uuid,p_step public.processing_step,p_progress integer) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog,public,pg_temp AS $$
BEGIN
 UPDATE public.processing_jobs j SET step=p_step,progress=GREATEST(COALESCE(progress,0),LEAST(99,GREATEST(0,p_progress))),execution_lease_expires_at=clock_timestamp()+interval '60 seconds',execution_heartbeat_at=clock_timestamp() WHERE id=p_job AND type='render_summary' AND status='active' AND p_token IS NOT NULL AND execution_lease_token=p_token AND execution_lease_expires_at>clock_timestamp() AND EXISTS(SELECT 1 FROM public.projects p WHERE p.id=j.project_id AND p.current_job_id=j.id AND p.deleted_at IS NULL);
 RETURN FOUND;
END $$;
--> statement-breakpoint
CREATE FUNCTION public.fail_summary_render(p_job uuid,p_token uuid,p_retry boolean) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog,public,pg_temp AS $$
DECLARE p public.projects; j public.processing_jobs; terminal boolean;
BEGIN
 SELECT p0.* INTO p FROM public.projects p0 JOIN public.processing_jobs j0 ON j0.project_id=p0.id WHERE j0.id=p_job FOR UPDATE OF p0;
 SELECT * INTO j FROM public.processing_jobs WHERE id=p_job AND type='render_summary' FOR UPDATE;
 IF NOT FOUND OR j.status NOT IN ('queued','active') OR (p_token IS NULL AND j.execution_lease_expires_at>clock_timestamp()) OR (p_token IS NOT NULL AND (j.execution_lease_token IS DISTINCT FROM p_token OR j.execution_lease_expires_at<=clock_timestamp())) THEN RETURN false; END IF;
 terminal:=NOT p_retry OR j.attempt_count>=2;
 UPDATE public.processing_jobs SET status=CASE WHEN terminal THEN 'failed'::public.processing_job_status ELSE 'queued'::public.processing_job_status END,step=CASE WHEN terminal THEN 'failed'::public.processing_step ELSE 'queued'::public.processing_step END,error_code='RENDER_FAILED',error_message='Summary export failed. Your saved edits are safe.',completed_at=CASE WHEN terminal THEN now() ELSE NULL END,execution_lease_token=NULL,execution_lease_owner=NULL,execution_lease_expires_at=NULL,execution_heartbeat_at=NULL WHERE id=j.id;
 IF terminal THEN UPDATE public.projects SET status='preview_ready' WHERE id=p.id AND current_job_id=j.id; END IF;
 RETURN true;
END $$;
--> statement-breakpoint
CREATE FUNCTION public.complete_summary_render(p_job uuid,p_token uuid,p_output jsonb,p_days integer) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog,public,pg_temp AS $$
DECLARE p public.projects; j public.processing_jobs; r public.summary_render_requests; output_id uuid; expected numeric;
BEGIN
 SELECT p0.* INTO p FROM public.projects p0 JOIN public.processing_jobs j0 ON j0.project_id=p0.id WHERE j0.id=p_job FOR UPDATE OF p0;
 SELECT * INTO j FROM public.processing_jobs WHERE id=p_job AND type='render_summary' FOR UPDATE;
 IF NOT FOUND OR p_token IS NULL OR p.deleted_at IS NOT NULL THEN RETURN NULL; END IF;
 SELECT * INTO r FROM public.summary_render_requests WHERE job_id=j.id;
 IF j.status='completed' THEN RETURN (SELECT id FROM public.rendered_outputs WHERE render_job_id=j.id AND storage_path=p_output->>'storagePath'); END IF;
 IF j.status<>'active' OR j.execution_lease_token IS DISTINCT FROM p_token OR j.execution_lease_expires_at<=clock_timestamp() OR p.current_job_id<>j.id THEN RETURN NULL; END IF;
 SELECT sum((x->>'endTime')::numeric-(x->>'startTime')::numeric) INTO expected FROM jsonb_array_elements(r.snapshot->'segments') x;
 IF p_days NOT BETWEEN 1 AND 365 OR p_output IS NULL OR jsonb_typeof(p_output)<>'object' OR jsonb_typeof(p_output->'storagePath') IS DISTINCT FROM 'string' OR length(p_output->>'storagePath')=0 OR jsonb_typeof(p_output->'fileName') IS DISTINCT FROM 'string' OR (p_output->>'fileName') !~ '^[a-zA-Z0-9._-]+\.mp4$' OR jsonb_typeof(p_output->'fileSizeBytes') IS DISTINCT FROM 'number' OR (p_output->>'fileSizeBytes') !~ '^[0-9]+$' OR (p_output->>'fileSizeBytes')::bigint<=0 OR jsonb_typeof(p_output->'durationSeconds') IS DISTINCT FROM 'number' OR abs((p_output->>'durationSeconds')::numeric-expected)>GREATEST(.12,jsonb_array_length(r.snapshot->'segments')*.034+.05) OR jsonb_typeof(p_output->'width') IS DISTINCT FROM 'number' OR jsonb_typeof(p_output->'height') IS DISTINCT FROM 'number' OR (p_output->>'width') !~ '^[0-9]+$' OR (p_output->>'height') !~ '^[0-9]+$' OR p_output->>'videoCodec' IS DISTINCT FROM 'h264' OR p_output->>'audioCodec' IS DISTINCT FROM 'aac' THEN RETURN NULL; END IF;
 INSERT INTO public.rendered_outputs(project_id,render_job_id,type,title,storage_path,file_name,file_size_bytes,duration_seconds,width,height,video_codec,audio_codec,expires_at) VALUES(p.id,j.id,'summary',r.snapshot->>'title',p_output->>'storagePath',p_output->>'fileName',(p_output->>'fileSizeBytes')::bigint,(p_output->>'durationSeconds')::numeric,(p_output->>'width')::integer,(p_output->>'height')::integer,'h264','aac',clock_timestamp()+make_interval(days=>p_days)) RETURNING id INTO output_id;
 UPDATE public.processing_jobs SET status='completed',step='completed',progress=100,completed_at=now(),execution_lease_token=NULL,execution_lease_owner=NULL,execution_lease_expires_at=NULL,execution_heartbeat_at=NULL,error_code=NULL,error_message=NULL WHERE id=j.id;
 UPDATE public.projects SET status='completed' WHERE id=p.id;
 RETURN output_id;
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range OR check_violation THEN RETURN NULL;
END $$;
--> statement-breakpoint
-- Extend durable dispatch without altering legacy clip claim/result contracts.
CREATE FUNCTION public.claim_summary_render_dispatch(p_token uuid) RETURNS TABLE(job_id uuid,project_id uuid,job_status text,attempt_count integer,lease_expired boolean) LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog,public,pg_temp AS $$
DECLARE d uuid;
BEGIN
 SELECT x.id INTO d FROM public.processing_job_dispatches x JOIN public.processing_jobs j ON j.id=x.processing_job_id JOIN public.projects p ON p.current_job_id=j.id WHERE j.type='render_summary' AND j.status IN ('queued','active') AND p.deleted_at IS NULL AND x.next_attempt_at<=clock_timestamp() AND (x.lease_token IS NULL OR x.lease_expires_at<=clock_timestamp()) ORDER BY x.next_attempt_at FOR UPDATE OF x SKIP LOCKED LIMIT 1;
 IF d IS NULL THEN RETURN; END IF;
 UPDATE public.processing_job_dispatches SET lease_token=p_token,lease_owner='summary-dispatcher',lease_expires_at=clock_timestamp()+interval '30 seconds',attempt_count=processing_job_dispatches.attempt_count+1 WHERE id=d;
 RETURN QUERY SELECT j.id,j.project_id,j.status::text,j.attempt_count,COALESCE(j.execution_lease_expires_at<clock_timestamp(),true) FROM public.processing_jobs j JOIN public.processing_job_dispatches x ON x.processing_job_id=j.id WHERE x.id=d;
END $$;
--> statement-breakpoint
DO $$ DECLARE signature text; BEGIN
 FOREACH signature IN ARRAY ARRAY['analysis_output_type(uuid,text,uuid)','get_owned_summary(text,uuid)','is_analysis_preview_ready(uuid,uuid)','finalize_summary_preview(uuid,text,uuid,jsonb)','save_owned_summary(text,uuid,integer,jsonb)','start_owned_summary_render(text,uuid,integer,text)','acquire_summary_render(uuid,uuid,uuid)','touch_summary_render(uuid,uuid,public.processing_step,integer)','fail_summary_render(uuid,uuid,boolean)','complete_summary_render(uuid,uuid,jsonb,integer)','claim_summary_render_dispatch(uuid)'] LOOP
  EXECUTE 'ALTER FUNCTION public.'||signature||' OWNER TO repurposepro_owner';
  EXECUTE 'REVOKE ALL ON FUNCTION public.'||signature||' FROM PUBLIC,repurposepro_runtime,repurposepro_processing,repurposepro_checkout,repurposepro_webhook';
 END LOOP;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.summary_json(uuid) FROM PUBLIC,repurposepro_runtime,repurposepro_processing,repurposepro_checkout,repurposepro_webhook;
--> statement-breakpoint
ALTER FUNCTION public.summary_json(uuid) OWNER TO repurposepro_owner;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.get_owned_summary(text,uuid),public.save_owned_summary(text,uuid,integer,jsonb),public.start_owned_summary_render(text,uuid,integer,text) TO repurposepro_runtime;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.analysis_output_type(uuid,text,uuid),public.is_analysis_preview_ready(uuid,uuid),public.finalize_summary_preview(uuid,text,uuid,jsonb),public.acquire_summary_render(uuid,uuid,uuid),public.touch_summary_render(uuid,uuid,public.processing_step,integer),public.fail_summary_render(uuid,uuid,boolean),public.complete_summary_render(uuid,uuid,jsonb,integer),public.claim_summary_render_dispatch(uuid) TO repurposepro_processing;
