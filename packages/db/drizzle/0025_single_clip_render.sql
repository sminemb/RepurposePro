ALTER TABLE public.projects ADD COLUMN current_analysis_job_id uuid CONSTRAINT projects_current_analysis_job_id_processing_jobs_id_fk REFERENCES public.processing_jobs(id) ON DELETE SET NULL;--> statement-breakpoint
UPDATE public.projects p SET current_analysis_job_id=j.id FROM public.processing_jobs j WHERE j.id=p.current_job_id AND j.type='analyze_video';--> statement-breakpoint
CREATE FUNCTION public.remember_project_analysis_job() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog, public, pg_temp AS $$
BEGIN
  IF NEW.current_job_id IS NULL THEN NEW.current_analysis_job_id := NULL; END IF;
  IF NEW.current_job_id IS NOT NULL AND EXISTS(SELECT 1 FROM public.processing_jobs j WHERE j.id=NEW.current_job_id AND j.project_id=NEW.id AND j.user_id=NEW.user_id AND j.type='analyze_video') THEN
    NEW.current_analysis_job_id := NEW.current_job_id;
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
ALTER FUNCTION public.remember_project_analysis_job() OWNER TO repurposepro_owner;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.remember_project_analysis_job() FROM PUBLIC;--> statement-breakpoint
CREATE TRIGGER remember_project_analysis_job BEFORE INSERT OR UPDATE OF current_job_id ON public.projects FOR EACH ROW EXECUTE FUNCTION public.remember_project_analysis_job();--> statement-breakpoint

CREATE TABLE public.render_requests (
  job_id uuid PRIMARY KEY CONSTRAINT render_requests_job_id_processing_jobs_id_fk REFERENCES public.processing_jobs(id) ON DELETE CASCADE,
  project_id uuid NOT NULL CONSTRAINT render_requests_project_id_projects_id_fk REFERENCES public.projects(id) ON DELETE CASCADE,
  clip_id uuid NOT NULL CONSTRAINT render_requests_clip_id_clip_candidates_id_fk REFERENCES public.clip_candidates(id),
  revision integer NOT NULL CHECK(revision>=0),
  idempotency_key varchar(100) NOT NULL,
  snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id,idempotency_key)
);--> statement-breakpoint
CREATE TABLE public.rendered_outputs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL CONSTRAINT rendered_outputs_project_id_projects_id_fk REFERENCES public.projects(id) ON DELETE CASCADE,
  render_job_id uuid NOT NULL CONSTRAINT rendered_outputs_render_job_id_render_requests_job_id_fk REFERENCES public.render_requests(job_id),
  clip_candidate_id uuid NOT NULL CONSTRAINT rendered_outputs_clip_candidate_id_clip_candidates_id_fk REFERENCES public.clip_candidates(id),
  type text NOT NULL DEFAULT 'clip' CHECK(type='clip'), title text NOT NULL,
  storage_path text NOT NULL, file_name text NOT NULL, mime_type text NOT NULL DEFAULT 'video/mp4',
  file_size_bytes bigint NOT NULL CHECK(file_size_bytes>0), duration_seconds numeric(12,3) NOT NULL CHECK(duration_seconds>0),
  width integer NOT NULL CHECK(width=1080), height integer NOT NULL CHECK(height=1920),
  video_codec text NOT NULL CHECK(video_codec='h264'), audio_codec text NOT NULL CHECK(audio_codec='aac'),
  status text NOT NULL DEFAULT 'ready' CHECK(status IN ('ready','failed','expired','deleted')),
  expires_at timestamptz NOT NULL, deleted_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(render_job_id,clip_candidate_id)
);--> statement-breakpoint
CREATE TABLE public.render_request_keys (
  project_id uuid NOT NULL CONSTRAINT render_request_keys_project_id_projects_id_fk REFERENCES public.projects(id) ON DELETE CASCADE,
  idempotency_key varchar(100) NOT NULL,
  job_id uuid NOT NULL CONSTRAINT render_request_keys_job_id_render_requests_job_id_fk REFERENCES public.render_requests(job_id) ON DELETE CASCADE,
  PRIMARY KEY(project_id,idempotency_key)
);--> statement-breakpoint
CREATE INDEX rendered_outputs_project_created_idx ON public.rendered_outputs(project_id,created_at DESC);--> statement-breakpoint
CREATE INDEX rendered_outputs_expiry_idx ON public.rendered_outputs(expires_at) WHERE deleted_at IS NULL;--> statement-breakpoint
ALTER TABLE public.render_requests OWNER TO repurposepro_owner;--> statement-breakpoint
ALTER TABLE public.rendered_outputs OWNER TO repurposepro_owner;--> statement-breakpoint
ALTER TABLE public.render_request_keys OWNER TO repurposepro_owner;--> statement-breakpoint
REVOKE ALL ON public.render_requests,public.rendered_outputs,public.render_request_keys FROM PUBLIC,repurposepro_runtime,repurposepro_processing,repurposepro_checkout,repurposepro_webhook;--> statement-breakpoint

CREATE FUNCTION public.start_owned_clip_render(p_user text,p_project uuid,p_clip uuid,p_revision integer,p_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog, public, pg_temp AS $$
DECLARE p public.projects; c public.clip_candidates; v public.uploaded_videos; r public.render_requests; j public.processing_jobs; f public.video_framing; snap jsonb; new_job uuid;
BEGIN
  SELECT * INTO p FROM public.projects WHERE id=p_project AND user_id=p_user AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','PROJECT_NOT_FOUND'); END IF;
  IF p_key IS NULL OR length(p_key) NOT BETWEEN 1 AND 100 OR p_revision IS NULL OR p_revision<0 THEN RETURN jsonb_build_object('error','VALIDATION_ERROR'); END IF;
  SELECT r0.* INTO r FROM public.render_requests r0 JOIN public.render_request_keys k ON k.job_id=r0.job_id WHERE k.project_id=p.id AND k.idempotency_key=p_key;
  IF FOUND THEN
    IF r.clip_id<>p_clip OR r.revision<>p_revision THEN RETURN jsonb_build_object('error','RENDER_IDEMPOTENCY_CONFLICT'); END IF;
    SELECT * INTO j FROM public.processing_jobs WHERE id=r.job_id;
    RETURN jsonb_build_object('jobId',j.id,'status',j.status,'outputCount',1);
  END IF;
  SELECT * INTO c FROM public.clip_candidates WHERE id=p_clip AND project_id=p.id AND processing_job_id=p.current_analysis_job_id AND kind='primary' AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','RENDER_CLIP_NOT_FOUND'); END IF;
  IF c.edit_revision<>p_revision THEN RETURN jsonb_build_object('error','CLIP_EDIT_CONFLICT'); END IF;
  SELECT j0.* INTO j FROM public.processing_jobs j0 WHERE j0.id=p.current_job_id;
  IF j.type='render_clips' AND j.status IN ('queued','active') THEN
    SELECT * INTO r FROM public.render_requests WHERE job_id=j.id;
    IF r.clip_id=p_clip AND r.revision=p_revision THEN
      INSERT INTO public.render_request_keys(project_id,idempotency_key,job_id) VALUES(p.id,p_key,j.id);
      RETURN jsonb_build_object('jobId',j.id,'status',j.status,'outputCount',1);
    END IF;
    RETURN jsonb_build_object('error','RENDER_ALREADY_RUNNING');
  END IF;
  IF p.output_type<>'clips' OR p.status NOT IN ('preview_ready','waiting_for_user_edits','completed') THEN RETURN jsonb_build_object('error','RENDER_INVALID_PROJECT_STATE'); END IF;
  SELECT v0.* INTO v FROM public.uploaded_videos v0 JOIN public.transcripts t ON t.uploaded_video_id=v0.id WHERE t.id=c.transcript_id AND v0.project_id=p.id AND v0.deleted_at IS NULL;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','SOURCE_VIDEO_NOT_FOUND'); END IF;
  IF v.expires_at<=clock_timestamp() THEN RETURN jsonb_build_object('error','SOURCE_VIDEO_EXPIRED'); END IF;
  SELECT * INTO f FROM public.video_framing WHERE uploaded_video_id=v.id AND version='mediapipe-v1' FOR SHARE;
  IF c.framing->>'mode'='follow' AND f.status IN ('queued','active') THEN RETURN jsonb_build_object('error','RENDER_FRAMING_PENDING'); END IF;
  snap:=jsonb_build_object('clip',public.clip_editor_json(c,v.duration_seconds)->'clip','tracks',CASE WHEN f.status='completed' THEN f.data ELSE NULL END,
    'sourceId',v.id,'sourcePath',v.storage_path,'sourceExpiresAt',v.expires_at,'sourceFileSizeBytes',v.file_size_bytes,'sourceWidth',v.width,'sourceHeight',v.height,'projectId',p.id,'userId',p.user_id);
  INSERT INTO public.processing_jobs(project_id,user_id,type,status,step,progress,credits_charged,refund_eligible) VALUES(p.id,p.user_id,'render_clips','queued','queued',0,0,false) RETURNING id INTO new_job;
  INSERT INTO public.render_requests(job_id,project_id,clip_id,revision,idempotency_key,snapshot) VALUES(new_job,p.id,c.id,c.edit_revision,p_key,snap);
  INSERT INTO public.render_request_keys(project_id,idempotency_key,job_id) VALUES(p.id,p_key,new_job);
  INSERT INTO public.processing_job_dispatches(processing_job_id) VALUES(new_job);
  UPDATE public.projects SET current_job_id=new_job,status='rendering',updated_at=now() WHERE id=p.id;
  RETURN jsonb_build_object('jobId',new_job,'status','queued','outputCount',1);
END $$;--> statement-breakpoint

CREATE FUNCTION public.claim_render_dispatch(p_token uuid) RETURNS TABLE(job_id uuid,project_id uuid,job_status text,attempt_count integer,lease_expired boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog, public, pg_temp AS $$
DECLARE d uuid;
BEGIN
  SELECT x.id INTO d FROM public.processing_job_dispatches x JOIN public.processing_jobs j ON j.id=x.processing_job_id JOIN public.projects p ON p.current_job_id=j.id
  WHERE j.type='render_clips' AND j.status IN ('queued','active') AND p.deleted_at IS NULL AND x.next_attempt_at<=clock_timestamp() AND (x.lease_token IS NULL OR x.lease_expires_at<=clock_timestamp())
  ORDER BY x.next_attempt_at FOR UPDATE OF x SKIP LOCKED LIMIT 1;
  IF d IS NULL THEN RETURN; END IF;
  UPDATE public.processing_job_dispatches SET lease_token=p_token,lease_owner='render-dispatcher',lease_expires_at=clock_timestamp()+interval '30 seconds',attempt_count=processing_job_dispatches.attempt_count+1 WHERE id=d;
  RETURN QUERY SELECT j.id,j.project_id,j.status::text,j.attempt_count,COALESCE(j.execution_lease_expires_at<clock_timestamp(),true) FROM public.processing_jobs j JOIN public.processing_job_dispatches x ON x.processing_job_id=j.id WHERE x.id=d;
END $$;--> statement-breakpoint
CREATE FUNCTION public.finish_render_dispatch(p_job uuid,p_token uuid,p_published boolean) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog, public, pg_temp AS $$
BEGIN
  UPDATE public.processing_job_dispatches SET status=CASE WHEN p_published THEN 'published'::public.processing_dispatch_status ELSE status END,
    published_at=CASE WHEN p_published THEN COALESCE(published_at,now()) ELSE published_at END,bullmq_job_id=CASE WHEN p_published THEN p_job::text ELSE bullmq_job_id END,
    next_attempt_at=clock_timestamp()+CASE WHEN p_published THEN interval '15 seconds' ELSE interval '3 seconds' END,lease_token=NULL,lease_owner=NULL,lease_expires_at=NULL
  WHERE processing_job_id=p_job AND lease_token=p_token;
  IF NOT FOUND THEN RETURN false; END IF;
  IF p_published THEN UPDATE public.processing_jobs SET bullmq_job_id=p_job::text WHERE id=p_job AND type='render_clips'; END IF;
  RETURN true;
END $$;--> statement-breakpoint

CREATE FUNCTION public.acquire_clip_render(p_job uuid,p_project uuid,p_token uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog, public, pg_temp AS $$
DECLARE j public.processing_jobs; snap jsonb;
BEGIN
  PERFORM 1 FROM public.projects WHERE id=p_project AND current_job_id=p_job AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO j FROM public.processing_jobs WHERE id=p_job AND project_id=p_project AND type='render_clips' FOR UPDATE;
  IF j.status='completed' THEN RETURN jsonb_build_object('completed',true); END IF;
  IF j.status NOT IN ('queued','active') OR j.attempt_count>=2 OR (j.status='active' AND j.execution_lease_expires_at>clock_timestamp()) THEN RETURN NULL; END IF;
  SELECT snapshot INTO snap FROM public.render_requests WHERE job_id=p_job;
  UPDATE public.processing_jobs SET status='active',step='preparing',progress=2,attempt_count=attempt_count+1,started_at=COALESCE(started_at,now()),execution_lease_token=p_token,execution_lease_owner='render-worker',execution_lease_expires_at=clock_timestamp()+interval '60 seconds',execution_heartbeat_at=clock_timestamp() WHERE id=p_job;
  RETURN snap;
END $$;--> statement-breakpoint
CREATE FUNCTION public.touch_clip_render(p_job uuid,p_token uuid,p_step public.processing_step,p_progress integer) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog, public, pg_temp AS $$
BEGIN
  IF p_step NOT IN ('preparing','rendering','saving_output') OR p_progress NOT BETWEEN 0 AND 99 THEN RETURN false; END IF;
  UPDATE public.processing_jobs j SET step=p_step,progress=GREATEST(COALESCE(progress,0),p_progress),execution_heartbeat_at=clock_timestamp(),execution_lease_expires_at=clock_timestamp()+interval '60 seconds'
  WHERE j.id=p_job AND j.type='render_clips' AND j.status='active' AND j.execution_lease_token=p_token AND j.execution_lease_expires_at>clock_timestamp()
    AND EXISTS(SELECT 1 FROM public.projects p WHERE p.id=j.project_id AND p.current_job_id=j.id AND p.deleted_at IS NULL);
  RETURN FOUND;
END $$;--> statement-breakpoint
CREATE FUNCTION public.fail_clip_render(p_job uuid,p_token uuid,p_retry boolean,p_code text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog, public, pg_temp AS $$
DECLARE j public.processing_jobs;
BEGIN
  SELECT * INTO j FROM public.processing_jobs WHERE id=p_job AND type='render_clips';
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM 1 FROM public.projects WHERE id=j.project_id FOR UPDATE;
  SELECT * INTO j FROM public.processing_jobs WHERE id=p_job FOR UPDATE;
  IF j.status NOT IN ('queued','active') OR (p_token IS NOT NULL AND (j.execution_lease_token IS DISTINCT FROM p_token OR j.execution_lease_expires_at<=clock_timestamp())) OR (p_token IS NULL AND j.execution_lease_expires_at>clock_timestamp()) THEN RETURN false; END IF;
  p_retry:=p_retry AND j.attempt_count<2;
  UPDATE public.processing_jobs SET status=CASE WHEN p_retry THEN 'queued'::public.processing_job_status ELSE 'failed'::public.processing_job_status END,step=CASE WHEN p_retry THEN 'queued'::public.processing_step ELSE 'failed'::public.processing_step END,
    error_code=CASE WHEN p_code IN ('RENDER_SOURCE_UNAVAILABLE','RENDER_FAILED','RENDER_LEASE_EXPIRED') THEN p_code ELSE 'RENDER_FAILED' END,error_message='Your clip could not be exported. Your saved edits are safe; try rendering again.',completed_at=CASE WHEN p_retry THEN NULL ELSE now() END,
    execution_lease_token=NULL,execution_lease_owner=NULL,execution_lease_expires_at=NULL,execution_heartbeat_at=NULL WHERE id=p_job;
  IF NOT p_retry THEN UPDATE public.projects SET status='preview_ready',updated_at=now() WHERE id=j.project_id AND current_job_id=p_job AND deleted_at IS NULL; END IF;
  RETURN true;
END $$;--> statement-breakpoint

CREATE FUNCTION public.complete_clip_render(p_job uuid,p_token uuid,p_output jsonb,p_retention integer) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog, public, pg_temp AS $$
DECLARE j public.processing_jobs; r public.render_requests; output_id uuid;
BEGIN
  SELECT * INTO j FROM public.processing_jobs WHERE id=p_job AND type='render_clips';
  PERFORM 1 FROM public.projects WHERE id=j.project_id AND current_job_id=p_job AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO j FROM public.processing_jobs WHERE id=p_job FOR UPDATE;
  SELECT id INTO output_id FROM public.rendered_outputs WHERE render_job_id=p_job AND storage_path=p_output->>'storagePath' AND storage_path LIKE '%/'||p_job::text||'/'||p_token::text||'.mp4';
  IF j.status='completed' THEN RETURN output_id; END IF;
  IF j.status<>'active' OR j.execution_lease_token IS DISTINCT FROM p_token OR j.execution_lease_expires_at<=clock_timestamp() OR p_retention NOT BETWEEN 1 AND 365 THEN RETURN NULL; END IF;
  SELECT * INTO r FROM public.render_requests WHERE job_id=p_job;
  IF p_output->>'storagePath' NOT LIKE '%/'||p_job::text||'/'||p_token::text||'.mp4' THEN RETURN NULL; END IF;
  INSERT INTO public.rendered_outputs(project_id,render_job_id,clip_candidate_id,title,storage_path,file_name,file_size_bytes,duration_seconds,width,height,video_codec,audio_codec,expires_at)
  VALUES(j.project_id,p_job,r.clip_id,r.snapshot#>>'{clip,title}',p_output->>'storagePath',p_output->>'fileName',(p_output->>'fileSizeBytes')::bigint,(p_output->>'durationSeconds')::numeric,1080,1920,'h264','aac',clock_timestamp()+make_interval(days=>p_retention)) RETURNING id INTO output_id;
  UPDATE public.processing_jobs SET status='completed',step='completed',progress=100,completed_at=now(),error_code=NULL,error_message=NULL,execution_lease_token=NULL,execution_lease_owner=NULL,execution_lease_expires_at=NULL,execution_heartbeat_at=NULL WHERE id=p_job;
  UPDATE public.projects SET status='completed',updated_at=now() WHERE id=j.project_id;
  RETURN output_id;
END $$;--> statement-breakpoint

CREATE FUNCTION public.list_owned_render_outputs(p_user text,p_project uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO pg_catalog, public, pg_temp AS $$
  SELECT COALESCE((SELECT jsonb_agg(jsonb_build_object('id',o.id,'renderJobId',o.render_job_id,'clipId',o.clip_candidate_id,'type',o.type,'title',o.title,'durationSeconds',o.duration_seconds,'fileSizeBytes',o.file_size_bytes,'width',o.width,'height',o.height,'status',CASE WHEN o.deleted_at IS NOT NULL THEN 'deleted' WHEN o.expires_at<=now() THEN 'expired' ELSE o.status END,'createdAt',o.created_at,'expiresAt',o.expires_at) ORDER BY o.created_at DESC) FROM public.rendered_outputs o WHERE o.project_id=p.id),'[]'::jsonb) FROM public.projects p WHERE p.id=p_project AND p.user_id=p_user AND p.deleted_at IS NULL;
$$;--> statement-breakpoint
CREATE FUNCTION public.get_owned_render_output(p_user text,p_project uuid,p_output uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO pg_catalog, public, pg_temp AS $$
  SELECT jsonb_build_object('storagePath',o.storage_path,'fileName',o.file_name,'fileSizeBytes',o.file_size_bytes,'expiresAt',o.expires_at,'deleted',o.deleted_at IS NOT NULL OR o.status='deleted','status',o.status)
  FROM public.rendered_outputs o JOIN public.projects p ON p.id=o.project_id WHERE p.id=p_project AND p.user_id=p_user AND p.deleted_at IS NULL AND o.id=p_output;
$$;--> statement-breakpoint

ALTER FUNCTION public.start_owned_clip_render(text,uuid,uuid,integer,text) OWNER TO repurposepro_owner;--> statement-breakpoint
ALTER FUNCTION public.claim_render_dispatch(uuid) OWNER TO repurposepro_owner;--> statement-breakpoint
ALTER FUNCTION public.finish_render_dispatch(uuid,uuid,boolean) OWNER TO repurposepro_owner;--> statement-breakpoint
ALTER FUNCTION public.acquire_clip_render(uuid,uuid,uuid) OWNER TO repurposepro_owner;--> statement-breakpoint
ALTER FUNCTION public.touch_clip_render(uuid,uuid,public.processing_step,integer) OWNER TO repurposepro_owner;--> statement-breakpoint
ALTER FUNCTION public.fail_clip_render(uuid,uuid,boolean,text) OWNER TO repurposepro_owner;--> statement-breakpoint
ALTER FUNCTION public.complete_clip_render(uuid,uuid,jsonb,integer) OWNER TO repurposepro_owner;--> statement-breakpoint
ALTER FUNCTION public.list_owned_render_outputs(text,uuid) OWNER TO repurposepro_owner;--> statement-breakpoint
ALTER FUNCTION public.get_owned_render_output(text,uuid,uuid) OWNER TO repurposepro_owner;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.start_owned_clip_render(text,uuid,uuid,integer,text),public.claim_render_dispatch(uuid),public.finish_render_dispatch(uuid,uuid,boolean),public.acquire_clip_render(uuid,uuid,uuid),public.touch_clip_render(uuid,uuid,public.processing_step,integer),public.fail_clip_render(uuid,uuid,boolean,text),public.complete_clip_render(uuid,uuid,jsonb,integer),public.list_owned_render_outputs(text,uuid),public.get_owned_render_output(text,uuid,uuid) FROM PUBLIC,repurposepro_runtime,repurposepro_processing,repurposepro_checkout,repurposepro_webhook;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.start_owned_clip_render(text,uuid,uuid,integer,text),public.list_owned_render_outputs(text,uuid),public.get_owned_render_output(text,uuid,uuid) TO repurposepro_runtime;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.claim_render_dispatch(uuid),public.finish_render_dispatch(uuid,uuid,boolean),public.acquire_clip_render(uuid,uuid,uuid),public.touch_clip_render(uuid,uuid,public.processing_step,integer),public.fail_clip_render(uuid,uuid,boolean,text),public.complete_clip_render(uuid,uuid,jsonb,integer) TO repurposepro_processing;
--> statement-breakpoint
CREATE FUNCTION public.clip_render_output_exists(p_job uuid,p_path text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO pg_catalog, public, pg_temp AS $$
  SELECT EXISTS(SELECT 1 FROM public.rendered_outputs WHERE render_job_id=p_job AND storage_path=p_path);
$$;--> statement-breakpoint
ALTER FUNCTION public.clip_render_output_exists(uuid,text) OWNER TO repurposepro_owner;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.clip_render_output_exists(uuid,text) FROM PUBLIC,repurposepro_runtime,repurposepro_checkout,repurposepro_webhook;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.clip_render_output_exists(uuid,text) TO repurposepro_processing;

--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.get_owned_clip_editor(p_user_id text, p_project_id uuid, p_clip_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO pg_catalog, public, pg_temp
AS $$
  SELECT public.clip_editor_json(candidate, video.duration_seconds)
  FROM public.clip_candidates AS candidate
  JOIN public.projects AS project ON project.id = candidate.project_id
  JOIN public.transcripts AS transcript ON transcript.id = candidate.transcript_id
  JOIN public.uploaded_videos AS video ON video.id = transcript.uploaded_video_id
  WHERE project.id = p_project_id AND project.user_id = p_user_id AND project.deleted_at IS NULL
    AND candidate.id = p_clip_id AND candidate.processing_job_id = project.current_analysis_job_id
    AND candidate.kind = 'primary' AND candidate.deleted_at IS NULL AND video.deleted_at IS NULL;
$$;

--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.save_owned_clip_editor(p_user_id text, p_project_id uuid, p_clip_id uuid, p_input jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO pg_catalog, public, pg_temp
AS $$
DECLARE
  v_project public.projects%ROWTYPE;
  v_candidate public.clip_candidates%ROWTYPE;
  v_duration numeric;
  v_start numeric;
  v_end numeric;
  v_baseline jsonb;
  v_edits jsonb;
  v_lines jsonb;
BEGIN
  SELECT * INTO v_project FROM public.projects WHERE id = p_project_id AND user_id = p_user_id
    AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('outcome', 'CLIP_NOT_FOUND'); END IF;
  SELECT * INTO v_candidate FROM public.clip_candidates WHERE id = p_clip_id AND project_id = p_project_id
    AND processing_job_id = v_project.current_analysis_job_id AND kind = 'primary' AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('outcome', 'CLIP_NOT_FOUND'); END IF;
  SELECT video.duration_seconds INTO v_duration FROM public.transcripts AS transcript
    JOIN public.uploaded_videos AS video ON video.id = transcript.uploaded_video_id
    WHERE transcript.id = v_candidate.transcript_id AND video.deleted_at IS NULL;
  IF NOT FOUND THEN RETURN jsonb_build_object('outcome', 'CLIP_NOT_FOUND'); END IF;

  IF p_input IS NULL OR jsonb_typeof(p_input) <> 'object' OR NOT p_input ?& ARRAY[
      'expectedRevision', 'startTime', 'endTime', 'captionsEnabled', 'captionPosition', 'previewFontSize', 'captionEdits']
    OR EXISTS (SELECT 1 FROM jsonb_object_keys(p_input) AS key WHERE key <> ALL(ARRAY[
      'expectedRevision', 'startTime', 'endTime', 'captionsEnabled', 'captionPosition', 'previewFontSize', 'captionEdits', 'captionTextColor', 'framing']))
    OR jsonb_typeof(p_input->'expectedRevision') <> 'number'
    OR jsonb_typeof(p_input->'startTime') <> 'number' OR jsonb_typeof(p_input->'endTime') <> 'number'
    OR jsonb_typeof(p_input->'captionsEnabled') <> 'boolean'
    OR jsonb_typeof(p_input->'previewFontSize') <> 'number'
    OR jsonb_typeof(p_input->'captionPosition') <> 'object'
    OR jsonb_typeof(p_input->'captionEdits') <> 'array'
  THEN RETURN jsonb_build_object('outcome', 'CLIP_INVALID_CAPTION_METADATA'); END IF;
  IF (p_input->>'expectedRevision')::numeric <> v_candidate.edit_revision THEN
    RETURN jsonb_build_object('outcome', 'CLIP_EDIT_CONFLICT');
  END IF;
  v_start := (p_input->>'startTime')::numeric;
  v_end := (p_input->>'endTime')::numeric;
  IF v_start < 0 OR v_end <= v_start OR round(v_start, 3) >= round(v_end, 3) THEN
    RETURN jsonb_build_object('outcome', 'CLIP_INVALID_TIME_RANGE');
  END IF;
  IF v_end > v_duration THEN RETURN jsonb_build_object('outcome', 'CLIP_OUTSIDE_SOURCE_DURATION'); END IF;
  v_start := round(v_start, 3); v_end := round(v_end, 3);
  IF NOT (p_input->'captionPosition') ?& ARRAY['x', 'y']
    OR (SELECT count(*) FROM jsonb_object_keys(p_input->'captionPosition')) <> 2
    OR jsonb_typeof(p_input#>'{captionPosition,x}') <> 'number'
    OR jsonb_typeof(p_input#>'{captionPosition,y}') <> 'number'
    OR (p_input#>>'{captionPosition,x}')::numeric NOT BETWEEN 0 AND 1
    OR (p_input#>>'{captionPosition,y}')::numeric NOT BETWEEN 0 AND 1
    OR (p_input->>'previewFontSize')::numeric NOT BETWEEN 12 AND 96
    OR trunc((p_input->>'previewFontSize')::numeric) <> (p_input->>'previewFontSize')::numeric
  THEN RETURN jsonb_build_object('outcome', 'CLIP_INVALID_CAPTION_METADATA'); END IF;
  IF (p_input ? 'captionTextColor' AND (jsonb_typeof(p_input->'captionTextColor') <> 'string' OR p_input->>'captionTextColor' !~ '^#[0-9A-Fa-f]{6}$'))
    OR (p_input ? 'framing' AND NOT public.valid_clip_framing(p_input->'framing'))
  THEN RETURN jsonb_build_object('outcome', 'CLIP_INVALID_CAPTION_METADATA'); END IF;
  v_baseline := public.clip_editor_baseline(v_candidate);
  v_edits := p_input->'captionEdits';
  IF jsonb_array_length(v_edits) > 2000
    OR (SELECT count(DISTINCT edit->>'id') FROM jsonb_array_elements(v_edits) AS edit) <> jsonb_array_length(v_edits)
  THEN RETURN jsonb_build_object('outcome', 'CLIP_INVALID_CAPTION_METADATA'); END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_edits) AS edit WHERE jsonb_typeof(edit) <> 'object'
      OR NOT edit ?& ARRAY['id', 'text', 'highlights']
      OR jsonb_typeof(edit->'id') <> 'string' OR jsonb_typeof(edit->'text') <> 'string'
      OR length(btrim(edit->>'text')) NOT BETWEEN 1 AND 160
      OR jsonb_typeof(edit->'highlights') <> 'array'
      OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_baseline) AS line WHERE line->>'id' = edit->>'id')
  ) THEN RETURN jsonb_build_object('outcome', 'CLIP_INVALID_CAPTION_METADATA'); END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_edits) AS edit WHERE jsonb_array_length(edit->'highlights') > 10
      OR EXISTS (SELECT 1 FROM jsonb_object_keys(edit) AS key WHERE key <> ALL(ARRAY['id','text','highlights','highlightColors']))
    OR (edit ? 'highlightColors' AND NOT public.valid_highlight_colors(edit->'highlightColors', edit->'highlights'))
      OR EXISTS (SELECT 1 FROM jsonb_array_elements(edit->'highlights') AS word
        WHERE jsonb_typeof(word) <> 'string' OR length(btrim(word#>>'{}')) NOT BETWEEN 1 AND 64)
  ) THEN RETURN jsonb_build_object('outcome', 'CLIP_INVALID_CAPTION_METADATA'); END IF;

  -- An older client omitting colors preserves still-present phrase colors.
  SELECT COALESCE(jsonb_agg(CASE WHEN edit ? 'highlightColors' THEN edit ELSE
    edit || jsonb_build_object('highlightColors', COALESCE((SELECT jsonb_object_agg(c.key,c.value)
      FROM jsonb_array_elements(v_candidate.caption_edits) old,
        LATERAL jsonb_each(COALESCE(old->'highlightColors','{}'::jsonb)) c
      WHERE old->>'id'=edit->>'id' AND EXISTS (SELECT 1 FROM jsonb_array_elements_text(edit->'highlights') h WHERE lower(h)=c.key)), '{}'::jsonb)) END), '[]'::jsonb)
    INTO v_edits FROM jsonb_array_elements(v_edits) edit;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', line->>'id',
    'startTime', GREATEST((line->>'startTime')::numeric, v_start),
    'endTime', LEAST((line->>'endTime')::numeric, v_end),
    'text', COALESCE(edit->>'text', line->>'text'), 'highlights', COALESCE(edit->'highlights', '[]'::jsonb), 'highlightColors', COALESCE(edit->'highlightColors','{}'::jsonb))
    ORDER BY (line->>'startTime')::numeric, line->>'id'), '[]'::jsonb)
  INTO v_lines FROM jsonb_array_elements(v_baseline) AS line
  LEFT JOIN jsonb_array_elements(v_edits) AS edit ON edit->>'id' = line->>'id'
  WHERE (line->>'endTime')::numeric > v_start AND (line->>'startTime')::numeric < v_end;
  UPDATE public.clip_candidates SET start_time = v_start, end_time = v_end,
    captions_enabled = (p_input->>'captionsEnabled')::boolean,
    caption_position = p_input->'captionPosition', preview_font_size = (p_input->>'previewFontSize')::integer,
    caption_text_color = COALESCE(p_input->>'captionTextColor', caption_text_color),
    framing = CASE WHEN p_input ? 'framing' THEN p_input->'framing' ELSE framing END,
    caption_baseline = v_baseline, caption_edits = v_edits, caption_lines = v_lines,
    edit_revision = edit_revision + 1, updated_at = clock_timestamp()
    WHERE id = p_clip_id RETURNING * INTO v_candidate;
  RETURN jsonb_build_object('outcome', 'saved', 'editor', public.clip_editor_json(v_candidate, v_duration));
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
  RETURN jsonb_build_object('outcome', 'CLIP_INVALID_CAPTION_METADATA');
END;
$$;

--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.list_owned_project_clip_candidates(p_user_id text, p_project_id uuid)
RETURNS TABLE(project_id uuid, source_duration_seconds numeric, clips jsonb)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO pg_catalog, public, pg_temp
AS $$
  SELECT
    project.id,
    video.duration_seconds,
    COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'captionLines', candidate.caption_lines,
          'captionPosition', candidate.caption_position,
          'captionStyle', candidate.caption_style,
          'captionsEnabled', candidate.captions_enabled,
          'captionTextColor', candidate.caption_text_color, 'framing', candidate.framing, 'crop', candidate.crop,
          'endTime', candidate.end_time,
          'id', candidate.id,
          'revision', candidate.edit_revision,
          'previewFontSize', candidate.preview_font_size,
          'rank', candidate.rank,
          'score', candidate.score,
          'startTime', candidate.start_time,
          'title', candidate.title
        )
        ORDER BY candidate.rank, candidate.id
      )
      FROM (
        SELECT candidate_record.*
        FROM public.clip_candidates AS candidate_record
        WHERE candidate_record.project_id = project.id
          AND candidate_record.processing_job_id = project.current_analysis_job_id
          AND candidate_record.kind = 'primary'
          AND candidate_record.deleted_at IS NULL
        ORDER BY candidate_record.rank, candidate_record.id
        LIMIT 10
      ) AS candidate
    ), '[]'::jsonb)
  FROM public.projects AS project
  JOIN LATERAL (
    SELECT video_record.duration_seconds
    FROM public.uploaded_videos AS video_record
    WHERE video_record.project_id = project.id
      AND video_record.deleted_at IS NULL
    ORDER BY video_record.created_at DESC, video_record.id DESC
    LIMIT 1
  ) AS video ON true
  WHERE project.id = p_project_id
    AND project.user_id = p_user_id
    AND project.deleted_at IS NULL;
$$;
