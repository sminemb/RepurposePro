CREATE TABLE "render_item_progress" (
	"job_id" uuid NOT NULL,
	"clip_id" uuid NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"step" text DEFAULT 'queued' NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"error_code" text,
	"error_message" text,
	"output_id" uuid,
	CONSTRAINT "render_item_progress_job_id_clip_id_pk" PRIMARY KEY("job_id","clip_id"),
	CONSTRAINT "render_item_progress_status_check" CHECK ("render_item_progress"."status" IN ('queued','active','completed','failed')),
	CONSTRAINT "render_item_progress_attempt_check" CHECK ("render_item_progress"."attempt_count" BETWEEN 0 AND 2),
	CONSTRAINT "render_item_progress_percent_check" CHECK ("render_item_progress"."progress" BETWEEN 0 AND 100)
);
--> statement-breakpoint
CREATE TABLE "render_request_items" (
	"job_id" uuid NOT NULL,
	"clip_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"ordinal" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	CONSTRAINT "render_request_items_job_id_clip_id_pk" PRIMARY KEY("job_id","clip_id"),
	CONSTRAINT "render_request_items_ordinal_unique" UNIQUE("job_id","ordinal"),
	CONSTRAINT "render_request_items_revision_check" CHECK ("render_request_items"."revision">=0)
);
--> statement-breakpoint
ALTER TABLE "render_item_progress" ADD CONSTRAINT "render_item_progress_job_id_clip_id_render_request_items_job_id_clip_id_fk" FOREIGN KEY ("job_id","clip_id") REFERENCES "public"."render_request_items"("job_id","clip_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "render_request_items" ADD CONSTRAINT "render_request_items_job_id_render_requests_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."render_requests"("job_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "render_request_items" ADD CONSTRAINT "render_request_items_clip_id_clip_candidates_id_fk" FOREIGN KEY ("clip_id") REFERENCES "public"."clip_candidates"("id") ON DELETE no action ON UPDATE no action;

--> statement-breakpoint
ALTER TABLE public.render_request_items OWNER TO repurposepro_owner;
--> statement-breakpoint
ALTER TABLE public.render_item_progress OWNER TO repurposepro_owner;
--> statement-breakpoint
REVOKE ALL ON public.render_request_items,public.render_item_progress FROM PUBLIC,repurposepro_runtime,repurposepro_processing,repurposepro_checkout,repurposepro_webhook;
--> statement-breakpoint
-- Preserve single-clip bindings and output identities during the backfill.
INSERT INTO public.render_request_items(job_id,clip_id,revision,ordinal,snapshot) SELECT job_id,clip_id,revision,0,snapshot FROM public.render_requests;
--> statement-breakpoint
INSERT INTO public.render_item_progress(job_id,clip_id,status,step,progress,attempt_count,error_code,error_message,output_id)
SELECT r.job_id,r.clip_id,CASE WHEN o.id IS NOT NULL THEN 'completed' WHEN j.status='failed' THEN 'failed' ELSE 'queued' END,
CASE WHEN o.id IS NOT NULL THEN 'completed' WHEN j.status='failed' THEN 'failed' ELSE 'queued' END,
CASE WHEN o.id IS NOT NULL THEN 100 ELSE COALESCE(j.progress,0) END,LEAST(j.attempt_count,2),j.error_code,j.error_message,o.id
FROM public.render_requests r JOIN public.processing_jobs j ON j.id=r.job_id LEFT JOIN public.rendered_outputs o ON o.render_job_id=r.job_id AND o.clip_candidate_id=r.clip_id;
--> statement-breakpoint
CREATE FUNCTION public.protect_render_request() RETURNS trigger LANGUAGE plpgsql SET search_path TO pg_catalog,public,pg_temp AS $$
BEGIN RAISE EXCEPTION 'render request is immutable' USING ERRCODE='55000'; END $$;
--> statement-breakpoint
CREATE TRIGGER render_request_immutable BEFORE UPDATE ON public.render_requests FOR EACH ROW EXECUTE FUNCTION public.protect_render_request();
--> statement-breakpoint
CREATE TRIGGER render_request_item_immutable BEFORE UPDATE ON public.render_request_items FOR EACH ROW EXECUTE FUNCTION public.protect_render_request();
--> statement-breakpoint
CREATE FUNCTION public.start_owned_clip_batch_render(p_user text,p_project uuid,p_revisions jsonb,p_key text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog,public,pg_temp AS $$
DECLARE p public.projects; c public.clip_candidates; v public.uploaded_videos; f public.video_framing; j public.processing_jobs; existing uuid; signature jsonb; clips jsonb:='[]'; item jsonb; snap jsonb; k text; rev integer; new_job uuid; n integer;
BEGIN
 SELECT * INTO p FROM public.projects WHERE id=p_project AND user_id=p_user AND deleted_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('error','PROJECT_NOT_FOUND'); END IF;
 IF p_key IS NULL OR p_key !~ '^[a-zA-Z0-9_-]{1,100}$' OR p_revisions IS NULL OR jsonb_typeof(p_revisions)<>'object' THEN RETURN jsonb_build_object('error','VALIDATION_ERROR'); END IF;
 SELECT count(*) INTO n FROM jsonb_object_keys(p_revisions);
 IF n NOT BETWEEN 1 AND 10 OR EXISTS(SELECT 1 FROM jsonb_each(p_revisions) x WHERE jsonb_typeof(x.value)<>'number' OR x.value::text !~ '^[0-9]+$') THEN RETURN jsonb_build_object('error','VALIDATION_ERROR'); END IF;
 SELECT job_id INTO existing FROM public.render_request_keys WHERE project_id=p.id AND idempotency_key=p_key;
 IF existing IS NOT NULL THEN
  SELECT jsonb_object_agg(clip_id::text,revision) INTO signature FROM public.render_request_items WHERE job_id=existing;
  IF signature<>p_revisions THEN RETURN jsonb_build_object('error','RENDER_IDEMPOTENCY_CONFLICT'); END IF;
  SELECT * INTO j FROM public.processing_jobs WHERE id=existing;
  RETURN jsonb_build_object('jobId',j.id,'status',j.status,'outputCount',n);
 END IF;
 -- Validate every selected revision and construct all snapshots before creating any work.
 FOR k,rev IN SELECT key,value::text::integer FROM jsonb_each(p_revisions) ORDER BY key LOOP
  SELECT * INTO c FROM public.clip_candidates WHERE id=k::uuid AND project_id=p.id AND processing_job_id=p.current_analysis_job_id AND kind='primary' AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','RENDER_CLIP_NOT_FOUND'); END IF;
  IF c.edit_revision<>rev THEN RETURN jsonb_build_object('error','CLIP_EDIT_CONFLICT'); END IF;
  IF NOT c.selected THEN RETURN jsonb_build_object('error','RENDER_CLIP_NOT_SELECTED'); END IF;
  SELECT v0.* INTO v FROM public.uploaded_videos v0 JOIN public.transcripts t ON t.uploaded_video_id=v0.id WHERE t.id=c.transcript_id AND v0.project_id=p.id AND v0.deleted_at IS NULL;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','SOURCE_VIDEO_NOT_FOUND'); END IF;
  IF v.expires_at<=clock_timestamp() THEN RETURN jsonb_build_object('error','SOURCE_VIDEO_EXPIRED'); END IF;
  SELECT * INTO f FROM public.video_framing WHERE uploaded_video_id=v.id AND version='mediapipe-v1' FOR SHARE;
  IF c.framing->>'mode'='follow' AND f.status IN ('queued','active') THEN RETURN jsonb_build_object('error','RENDER_FRAMING_PENDING'); END IF;
  snap:=jsonb_build_object('clip',public.clip_editor_json(c,v.duration_seconds)->'clip','tracks',CASE WHEN f.status='completed' THEN f.data ELSE NULL END,'sourceId',v.id,'sourcePath',v.storage_path,'sourceExpiresAt',v.expires_at,'sourceFileSizeBytes',v.file_size_bytes,'sourceWidth',v.width,'sourceHeight',v.height,'projectId',p.id,'userId',p.user_id);
  clips:=clips||jsonb_build_array(jsonb_build_object('clipId',c.id,'revision',rev,'snapshot',snap));
 END LOOP;
 SELECT * INTO j FROM public.processing_jobs WHERE project_id=p.id AND type IN ('render_clips','regenerate_clip_candidate') AND status IN ('queued','active') LIMIT 1;
 IF FOUND THEN
  SELECT jsonb_object_agg(clip_id::text,revision) INTO signature FROM public.render_request_items WHERE job_id=j.id;
  IF j.type='render_clips' AND signature=p_revisions THEN
   INSERT INTO public.render_request_keys(project_id,idempotency_key,job_id) VALUES(p.id,p_key,j.id);
   RETURN jsonb_build_object('jobId',j.id,'status',j.status,'outputCount',n);
  END IF;
  RETURN jsonb_build_object('error','RENDER_ALREADY_RUNNING');
 END IF;
 IF p.output_type<>'clips' OR p.status NOT IN ('preview_ready','waiting_for_user_edits','completed') THEN RETURN jsonb_build_object('error','RENDER_INVALID_PROJECT_STATE'); END IF;
 INSERT INTO public.processing_jobs(project_id,user_id,type,status,step,progress,credits_charged,refund_eligible) VALUES(p.id,p.user_id,'render_clips','queued','queued',0,0,false) RETURNING id INTO new_job;
 item:=clips->0;
 INSERT INTO public.render_requests(job_id,project_id,clip_id,revision,idempotency_key,snapshot) VALUES(new_job,p.id,(item->>'clipId')::uuid,(item->>'revision')::integer,p_key,item->'snapshot');
 INSERT INTO public.render_request_keys(project_id,idempotency_key,job_id) VALUES(p.id,p_key,new_job);
 INSERT INTO public.render_request_items(job_id,clip_id,revision,ordinal,snapshot) SELECT new_job,(x->>'clipId')::uuid,(x->>'revision')::integer,ord-1,x->'snapshot' FROM jsonb_array_elements(clips) WITH ORDINALITY items(x,ord);
 INSERT INTO public.render_item_progress(job_id,clip_id) SELECT new_job,clip_id FROM public.render_request_items WHERE job_id=new_job;
 INSERT INTO public.processing_job_dispatches(processing_job_id) VALUES(new_job);
 UPDATE public.projects SET current_job_id=new_job,status='rendering',updated_at=now() WHERE id=p.id;
 RETURN jsonb_build_object('jobId',new_job,'status','queued','outputCount',n);
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN RETURN jsonb_build_object('error','VALIDATION_ERROR');
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.start_owned_clip_render(p_user text,p_project uuid,p_clip uuid,p_revision integer,p_key text) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path TO pg_catalog,public,pg_temp AS $$
 SELECT public.start_owned_clip_batch_render(p_user,p_project,jsonb_build_object(p_clip::text,p_revision),p_key);
$$;
--> statement-breakpoint
CREATE FUNCTION public.finish_clip_batch(p_job uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog,public,pg_temp AS $$
DECLARE failed boolean; project uuid;
BEGIN
 IF EXISTS(SELECT 1 FROM public.render_item_progress WHERE job_id=p_job AND status IN ('queued','active')) THEN RETURN false; END IF;
 SELECT bool_or(status='failed') INTO failed FROM public.render_item_progress WHERE job_id=p_job;
 IF failed IS NULL THEN RETURN false; END IF;
 UPDATE public.processing_jobs SET status=CASE WHEN failed THEN 'failed'::public.processing_job_status ELSE 'completed'::public.processing_job_status END,step=CASE WHEN failed THEN 'failed'::public.processing_step ELSE 'completed'::public.processing_step END,progress=100,completed_at=now(),error_code=CASE WHEN failed THEN 'RENDER_PARTIAL_FAILURE' ELSE NULL END,error_message=CASE WHEN failed THEN 'Some clips could not be exported. Successful downloads are ready; retry failed selected clips.' ELSE NULL END,execution_lease_token=NULL,execution_lease_owner=NULL,execution_lease_expires_at=NULL,execution_heartbeat_at=NULL WHERE id=p_job RETURNING project_id INTO project;
 UPDATE public.projects SET status=CASE WHEN failed THEN 'preview_ready'::public.project_status ELSE 'completed'::public.project_status END,updated_at=now() WHERE id=project AND current_job_id=p_job AND deleted_at IS NULL;
 RETURN true;
END $$;
--> statement-breakpoint
CREATE FUNCTION public.acquire_clip_batch_render(p_job uuid,p_project uuid,p_token uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog,public,pg_temp AS $$
DECLARE j public.processing_jobs;
BEGIN
 PERFORM 1 FROM public.projects WHERE id=p_project AND current_job_id=p_job AND deleted_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RETURN NULL; END IF;
 SELECT * INTO j FROM public.processing_jobs WHERE id=p_job AND project_id=p_project AND type='render_clips' FOR UPDATE;
 IF j.status IN ('completed','failed') THEN RETURN jsonb_build_object('terminal',true); END IF;
 IF j.status NOT IN ('queued','active') OR j.execution_lease_expires_at>clock_timestamp() THEN RETURN NULL; END IF;
 UPDATE public.render_item_progress SET status=CASE WHEN attempt_count>=2 THEN 'failed' ELSE 'queued' END,step=CASE WHEN attempt_count>=2 THEN 'failed' ELSE 'queued' END,error_code='RENDER_LEASE_EXPIRED',error_message='This clip was interrupted. Try exporting it again.' WHERE job_id=p_job AND status='active';
 IF public.finish_clip_batch(p_job) THEN RETURN jsonb_build_object('terminal',true); END IF;
 UPDATE public.processing_jobs SET status='active',step='preparing',attempt_count=attempt_count+1,started_at=COALESCE(started_at,now()),execution_lease_token=p_token,execution_lease_owner='render-worker',execution_lease_expires_at=clock_timestamp()+interval '60 seconds',execution_heartbeat_at=clock_timestamp() WHERE id=p_job;
 RETURN jsonb_build_object('acquired',true);
END $$;
--> statement-breakpoint
CREATE FUNCTION public.begin_clip_render_item(p_job uuid,p_token uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog,public,pg_temp AS $$
DECLARE item public.render_request_items;
BEGIN
 PERFORM 1 FROM public.processing_jobs WHERE id=p_job AND type='render_clips' AND status='active' AND execution_lease_token=p_token AND execution_lease_expires_at>clock_timestamp() FOR UPDATE;
 IF NOT FOUND THEN RETURN NULL; END IF;
 UPDATE public.render_item_progress SET status='failed',step='failed',error_code='RENDER_RETRY_LIMIT',error_message='This clip could not be exported after two attempts.' WHERE job_id=p_job AND status='queued' AND attempt_count>=2;
 SELECT r.* INTO item FROM public.render_request_items r JOIN public.render_item_progress x USING(job_id,clip_id) WHERE r.job_id=p_job AND x.status='queued' AND x.attempt_count<2 ORDER BY x.attempt_count,r.ordinal LIMIT 1 FOR UPDATE OF x;
 IF NOT FOUND THEN PERFORM public.finish_clip_batch(p_job); RETURN NULL; END IF;
 UPDATE public.render_item_progress SET status='active',step='preparing',progress=2,attempt_count=attempt_count+1,error_code=NULL,error_message=NULL WHERE job_id=p_job AND clip_id=item.clip_id;
 RETURN item.snapshot;
END $$;
--> statement-breakpoint
CREATE FUNCTION public.touch_clip_render_item(p_job uuid,p_token uuid,p_clip uuid,p_step public.processing_step,p_progress integer) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog,public,pg_temp AS $$
BEGIN
 IF NOT public.touch_clip_render(p_job,p_token,p_step,LEAST(p_progress,99)) THEN RETURN false; END IF;
 UPDATE public.render_item_progress SET step=p_step::text,progress=GREATEST(progress,p_progress) WHERE job_id=p_job AND clip_id=p_clip AND status='active';
 IF NOT FOUND THEN RETURN false; END IF;
 UPDATE public.processing_jobs SET progress=(SELECT round(avg(progress))::integer FROM public.render_item_progress WHERE job_id=p_job) WHERE id=p_job;
 RETURN true;
END $$;
--> statement-breakpoint
CREATE FUNCTION public.fail_clip_render_item(p_job uuid,p_token uuid,p_clip uuid,p_retry boolean,p_code text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog,public,pg_temp AS $$
BEGIN
 PERFORM 1 FROM public.processing_jobs WHERE id=p_job AND type='render_clips' AND status='active' AND execution_lease_token=p_token AND execution_lease_expires_at>clock_timestamp() FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 UPDATE public.render_item_progress SET status=CASE WHEN p_retry AND attempt_count<2 THEN 'queued' ELSE 'failed' END,step=CASE WHEN p_retry AND attempt_count<2 THEN 'queued' ELSE 'failed' END,progress=0,error_code=CASE WHEN p_code='RENDER_SOURCE_UNAVAILABLE' THEN p_code ELSE 'RENDER_FAILED' END,error_message='This clip could not be exported. Its saved edits are safe; try again.' WHERE job_id=p_job AND clip_id=p_clip AND status='active';
 IF NOT FOUND THEN RETURN false; END IF;
 PERFORM public.finish_clip_batch(p_job); RETURN true;
END $$;
--> statement-breakpoint
CREATE FUNCTION public.complete_clip_render_item(p_job uuid,p_token uuid,p_clip uuid,p_output jsonb,p_retention integer) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog,public,pg_temp AS $$
DECLARE j public.processing_jobs; r public.render_request_items; output_id uuid;
BEGIN
 SELECT * INTO j FROM public.processing_jobs WHERE id=p_job AND type='render_clips';
 PERFORM 1 FROM public.projects WHERE id=j.project_id AND current_job_id=p_job AND deleted_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RETURN NULL; END IF;
 SELECT * INTO j FROM public.processing_jobs WHERE id=p_job FOR UPDATE;
 SELECT id INTO output_id FROM public.rendered_outputs WHERE render_job_id=p_job AND clip_candidate_id=p_clip AND storage_path=p_output->>'storagePath';
 IF output_id IS NOT NULL AND p_output->>'storagePath' LIKE '%/'||p_job::text||'/'||p_clip::text||'/'||p_token::text||'.mp4' THEN RETURN output_id; END IF;
 IF j.status<>'active' OR j.execution_lease_token IS DISTINCT FROM p_token OR j.execution_lease_expires_at<=clock_timestamp() OR p_retention NOT BETWEEN 1 AND 365 OR p_output->>'storagePath' NOT LIKE '%/'||p_job::text||'/'||p_clip::text||'/'||p_token::text||'.mp4' THEN RETURN NULL; END IF;
 PERFORM 1 FROM public.render_item_progress WHERE job_id=p_job AND clip_id=p_clip AND status='active';
 IF NOT FOUND THEN RETURN NULL; END IF;
 SELECT * INTO r FROM public.render_request_items WHERE job_id=p_job AND clip_id=p_clip;
 INSERT INTO public.rendered_outputs(project_id,render_job_id,clip_candidate_id,title,storage_path,file_name,file_size_bytes,duration_seconds,width,height,video_codec,audio_codec,expires_at)
 VALUES(j.project_id,p_job,p_clip,r.snapshot#>>'{clip,title}',p_output->>'storagePath',p_output->>'fileName',(p_output->>'fileSizeBytes')::bigint,(p_output->>'durationSeconds')::numeric,1080,1920,'h264','aac',clock_timestamp()+make_interval(days=>p_retention)) RETURNING id INTO output_id;
 UPDATE public.render_item_progress SET status='completed',step='completed',progress=100,output_id=complete_clip_render_item.output_id,error_code=NULL,error_message=NULL WHERE job_id=p_job AND clip_id=p_clip;
 PERFORM public.finish_clip_batch(p_job); RETURN output_id;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.get_owned_job_status(p_user text,p_job uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO pg_catalog,public,pg_temp AS $$
 SELECT jsonb_build_object('id',j.id,'status',j.status,'step',j.step,'progress',COALESCE(j.progress,0),'message',j.error_message,'startedAt',j.started_at,'completedAt',j.completed_at)
 || CASE WHEN r.replacement_clip_id IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('replacementClipId',r.replacement_clip_id) END
 || CASE WHEN j.type<>'render_clips' THEN '{}'::jsonb ELSE jsonb_build_object('clips',COALESCE((SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object('clipId',i.clip_id,'title',i.snapshot#>>'{clip,title}','status',x.status,'step',x.step,'progress',x.progress,'errorCode',x.error_code,'errorMessage',x.error_message,'outputId',x.output_id)) ORDER BY i.ordinal) FROM public.render_request_items i JOIN public.render_item_progress x USING(job_id,clip_id) WHERE i.job_id=j.id),'[]'::jsonb)) END
 FROM public.processing_jobs j JOIN public.projects p ON p.id=j.project_id LEFT JOIN public.clip_regeneration_requests r ON r.job_id=j.id WHERE j.id=p_job AND j.user_id=p_user AND p.user_id=p_user AND p.deleted_at IS NULL;
$$;

--> statement-breakpoint
ALTER FUNCTION public.protect_render_request() OWNER TO repurposepro_owner;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.protect_render_request() FROM PUBLIC,repurposepro_runtime,repurposepro_processing,repurposepro_checkout,repurposepro_webhook;
--> statement-breakpoint
ALTER FUNCTION public.start_owned_clip_batch_render(text,uuid,jsonb,text) OWNER TO repurposepro_owner;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.start_owned_clip_batch_render(text,uuid,jsonb,text) FROM PUBLIC,repurposepro_runtime,repurposepro_processing,repurposepro_checkout,repurposepro_webhook;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.start_owned_clip_batch_render(text,uuid,jsonb,text) TO repurposepro_runtime;
--> statement-breakpoint
ALTER FUNCTION public.finish_clip_batch(uuid) OWNER TO repurposepro_owner;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.finish_clip_batch(uuid) FROM PUBLIC,repurposepro_runtime,repurposepro_processing,repurposepro_checkout,repurposepro_webhook;
--> statement-breakpoint
ALTER FUNCTION public.acquire_clip_batch_render(uuid,uuid,uuid) OWNER TO repurposepro_owner;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.acquire_clip_batch_render(uuid,uuid,uuid) FROM PUBLIC,repurposepro_runtime,repurposepro_processing,repurposepro_checkout,repurposepro_webhook;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.acquire_clip_batch_render(uuid,uuid,uuid) TO repurposepro_processing;
--> statement-breakpoint
ALTER FUNCTION public.begin_clip_render_item(uuid,uuid) OWNER TO repurposepro_owner;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.begin_clip_render_item(uuid,uuid) FROM PUBLIC,repurposepro_runtime,repurposepro_processing,repurposepro_checkout,repurposepro_webhook;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.begin_clip_render_item(uuid,uuid) TO repurposepro_processing;
--> statement-breakpoint
ALTER FUNCTION public.touch_clip_render_item(uuid,uuid,uuid,public.processing_step,integer) OWNER TO repurposepro_owner;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.touch_clip_render_item(uuid,uuid,uuid,public.processing_step,integer) FROM PUBLIC,repurposepro_runtime,repurposepro_processing,repurposepro_checkout,repurposepro_webhook;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.touch_clip_render_item(uuid,uuid,uuid,public.processing_step,integer) TO repurposepro_processing;
--> statement-breakpoint
ALTER FUNCTION public.fail_clip_render_item(uuid,uuid,uuid,boolean,text) OWNER TO repurposepro_owner;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.fail_clip_render_item(uuid,uuid,uuid,boolean,text) FROM PUBLIC,repurposepro_runtime,repurposepro_processing,repurposepro_checkout,repurposepro_webhook;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.fail_clip_render_item(uuid,uuid,uuid,boolean,text) TO repurposepro_processing;
--> statement-breakpoint
ALTER FUNCTION public.complete_clip_render_item(uuid,uuid,uuid,jsonb,integer) OWNER TO repurposepro_owner;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.complete_clip_render_item(uuid,uuid,uuid,jsonb,integer) FROM PUBLIC,repurposepro_runtime,repurposepro_processing,repurposepro_checkout,repurposepro_webhook;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.complete_clip_render_item(uuid,uuid,uuid,jsonb,integer) TO repurposepro_processing;
