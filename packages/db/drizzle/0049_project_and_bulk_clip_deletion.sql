CREATE FUNCTION public.delete_owned_project(p_user text,p_project uuid,p_directory text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog,public,pg_temp AS $$
DECLARE p public.projects;
BEGIN
 SELECT * INTO p FROM public.projects WHERE id=p_project AND user_id=p_user FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('error','PROJECT_NOT_FOUND'); END IF;
 IF p.deleted_at IS NOT NULL THEN RETURN '{}'::jsonb; END IF;
 IF EXISTS(SELECT 1 FROM public.processing_jobs WHERE project_id=p.id AND status IN ('queued','active'))
 OR EXISTS(SELECT 1 FROM public.video_framing f JOIN public.uploaded_videos v ON v.id=f.uploaded_video_id WHERE v.project_id=p.id AND f.status IN ('queued','active'))
 OR EXISTS(SELECT 1 FROM public.storage_cleanup_targets WHERE project_id=p.id AND writer_expires_at>clock_timestamp())
 THEN RETURN jsonb_build_object('error','PROJECT_BUSY'); END IF;
 IF p_directory IS NULL OR p_directory NOT LIKE '%/projects/'||p.id::text OR p_directory LIKE '%/../%' THEN
   RETURN jsonb_build_object('error','PROJECT_DELETE_FAILED');
 END IF;
 UPDATE public.projects SET deleted_at=clock_timestamp(),updated_at=clock_timestamp() WHERE id=p.id;
 INSERT INTO public.storage_cleanup_targets(kind,project_id,user_id,storage_path,expires_at)
 VALUES('project',p.id,p.user_id,p_directory,clock_timestamp());
 UPDATE public.storage_cleanup_targets SET expires_at=LEAST(expires_at,clock_timestamp()),next_attempt_at=clock_timestamp()
 WHERE project_id=p.id AND deleted_at IS NULL;
 RETURN '{}'::jsonb;
END $$;
--> statement-breakpoint
ALTER FUNCTION public.delete_owned_project(text,uuid,text) OWNER TO repurposepro_owner;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.delete_owned_project(text,uuid,text) FROM PUBLIC,repurposepro_admin,repurposepro_processing,repurposepro_checkout,repurposepro_webhook;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.delete_owned_project(text,uuid,text) TO repurposepro_runtime;
--> statement-breakpoint
CREATE FUNCTION public.delete_owned_clip_candidates(p_user text,p_project uuid,p_clips jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog,public,pg_temp AS $$
DECLARE p public.projects; c public.clip_candidates; item record;
BEGIN
 IF jsonb_typeof(p_clips) IS DISTINCT FROM 'array' THEN RETURN jsonb_build_object('error','VALIDATION_ERROR'); END IF;
 IF jsonb_array_length(p_clips) NOT BETWEEN 1 AND 100 THEN RETURN jsonb_build_object('error','VALIDATION_ERROR'); END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_clips) x WHERE jsonb_typeof(x) IS DISTINCT FROM 'object'
 OR jsonb_typeof(x->'id') IS DISTINCT FROM 'string' OR jsonb_typeof(x->'expectedRevision') IS DISTINCT FROM 'number'
 OR (x->>'expectedRevision') !~ '^[0-9]+$') THEN RETURN jsonb_build_object('error','VALIDATION_ERROR'); END IF;
 IF EXISTS(SELECT 1 FROM jsonb_to_recordset(p_clips) AS x(id uuid,"expectedRevision" integer) GROUP BY id HAVING count(*)>1)
 THEN RETURN jsonb_build_object('error','VALIDATION_ERROR'); END IF;
 SELECT * INTO p FROM public.projects WHERE id=p_project AND user_id=p_user AND deleted_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('error','CLIP_NOT_FOUND'); END IF;
 FOR item IN SELECT * FROM jsonb_to_recordset(p_clips) AS x(id uuid,"expectedRevision" integer) ORDER BY id LOOP
   SELECT * INTO c FROM public.clip_candidates WHERE id=item.id AND project_id=p.id AND processing_job_id=p.current_analysis_job_id AND kind='primary' FOR UPDATE;
   IF NOT FOUND THEN RETURN jsonb_build_object('error','CLIP_NOT_FOUND'); END IF;
   IF c.edit_revision<>item."expectedRevision" THEN RETURN jsonb_build_object('error','CLIP_EDIT_CONFLICT'); END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM public.processing_jobs WHERE project_id=p.id AND type IN ('render_clips','regenerate_clip_candidate') AND status IN ('queued','active'))
 THEN RETURN jsonb_build_object('error','CLIP_BUSY'); END IF;
 UPDATE public.clip_candidates SET deleted_at=clock_timestamp(),selected=false,updated_at=clock_timestamp()
 WHERE id IN (SELECT id FROM jsonb_to_recordset(p_clips) AS x(id uuid)) AND deleted_at IS NULL;
 RETURN '{}'::jsonb;
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
 RETURN jsonb_build_object('error','VALIDATION_ERROR');
END $$;
--> statement-breakpoint
ALTER FUNCTION public.delete_owned_clip_candidates(text,uuid,jsonb) OWNER TO repurposepro_owner;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.delete_owned_clip_candidates(text,uuid,jsonb) FROM PUBLIC,repurposepro_admin,repurposepro_processing,repurposepro_checkout,repurposepro_webhook;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.delete_owned_clip_candidates(text,uuid,jsonb) TO repurposepro_runtime;

--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.finish_storage_cleanup(p_id uuid,p_token uuid,p_success boolean) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog,public,pg_temp AS $$
DECLARE t public.storage_cleanup_targets;
BEGIN
 SELECT * INTO t FROM public.storage_cleanup_targets WHERE id=p_id;
 IF NOT FOUND THEN RETURN false; END IF;
 IF t.project_id IS NOT NULL THEN PERFORM 1 FROM public.projects WHERE id=t.project_id FOR UPDATE; END IF;
 SELECT * INTO t FROM public.storage_cleanup_targets WHERE id=p_id FOR UPDATE;
 IF t.lease_token IS DISTINCT FROM p_token THEN RETURN false; END IF;
 IF t.deleted_at IS NOT NULL THEN RETURN p_success; END IF;
 IF t.lease_expires_at IS NULL OR t.lease_expires_at<=clock_timestamp() THEN RETURN false; END IF;
 IF NOT p_success THEN
  UPDATE public.storage_cleanup_targets SET lease_token=NULL,lease_expires_at=NULL,next_attempt_at=clock_timestamp()+interval '30 seconds' WHERE id=p_id;
  RETURN true;
 END IF;
 IF t.kind='project' THEN
  IF NOT EXISTS(SELECT 1 FROM public.projects WHERE id=t.project_id AND deleted_at IS NOT NULL) THEN RETURN false; END IF;
  UPDATE public.uploaded_videos SET deleted_at=COALESCE(deleted_at,clock_timestamp()) WHERE project_id=t.project_id;
  UPDATE public.rendered_outputs SET deleted_at=COALESCE(deleted_at,clock_timestamp()),status='deleted' WHERE project_id=t.project_id;
 ELSIF t.kind='source' THEN UPDATE public.uploaded_videos SET deleted_at=COALESCE(deleted_at,clock_timestamp()) WHERE id=t.asset_id AND expires_at<=clock_timestamp();
 ELSIF t.kind='output' THEN UPDATE public.rendered_outputs SET deleted_at=COALESCE(deleted_at,clock_timestamp()),status='expired' WHERE id=t.asset_id AND expires_at<=clock_timestamp(); END IF;
 UPDATE public.storage_cleanup_targets SET deleted_at=clock_timestamp(),lease_expires_at=NULL WHERE id=p_id;
 RETURN true;
END $$;

--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.owned_video_framing(p_user text, p_project uuid, p_start boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog, public, pg_temp AS $$
DECLARE v_video uuid; v_result public.video_framing;
BEGIN
 PERFORM 1 FROM public.projects WHERE id=p_project AND user_id=p_user AND deleted_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF EXISTS(SELECT 1 FROM public.uploaded_videos WHERE project_id=p_project AND expires_at<=clock_timestamp()) THEN
   RETURN jsonb_build_object('error','SOURCE_VIDEO_EXPIRED');
 END IF;
 SELECT v.id INTO v_video FROM public.projects p JOIN public.uploaded_videos v ON v.project_id=p.id
 WHERE p.id=p_project AND p.user_id=p_user AND p.deleted_at IS NULL AND v.deleted_at IS NULL AND v.expires_at>clock_timestamp()
 ORDER BY v.created_at DESC,v.id DESC LIMIT 1;
 IF v_video IS NULL THEN RETURN NULL; END IF;
 IF p_start THEN
   INSERT INTO public.video_framing(uploaded_video_id,version) VALUES(v_video,'mediapipe-v1')
   ON CONFLICT(uploaded_video_id,version) DO UPDATE SET status='queued',lease_token=NULL,lease_expires_at=NULL,updated_at=clock_timestamp()
   WHERE video_framing.status='failed' OR (video_framing.status='completed' AND jsonb_array_length(video_framing.data->'tracks')=0 AND video_framing.updated_at < clock_timestamp()-interval '30 seconds');
 END IF;
 SELECT * INTO v_result FROM public.video_framing WHERE uploaded_video_id=v_video AND version='mediapipe-v1';
 RETURN jsonb_build_object('status',COALESCE(v_result.status,'missing'),'data',v_result.data);
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.request_job_framing(p_job uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog, public, pg_temp AS $$
DECLARE v_video uuid; v_id uuid;
BEGIN
 PERFORM 1 FROM public.projects p JOIN public.processing_jobs j ON j.project_id=p.id WHERE j.id=p_job AND p.deleted_at IS NULL FOR UPDATE OF p;
 IF NOT FOUND THEN RETURN NULL; END IF;
 SELECT t.uploaded_video_id INTO v_video FROM public.processing_jobs j JOIN public.projects p ON p.id=j.project_id
 JOIN public.transcripts t ON t.processing_job_id=j.id JOIN public.uploaded_videos v ON v.id=t.uploaded_video_id
 WHERE j.id=p_job AND p.current_job_id=j.id AND p.deleted_at IS NULL AND v.deleted_at IS NULL AND v.expires_at>clock_timestamp();
 IF v_video IS NULL THEN RETURN NULL; END IF;
 INSERT INTO public.video_framing(uploaded_video_id,version) VALUES(v_video,'mediapipe-v1') ON CONFLICT DO NOTHING;
 SELECT id INTO v_id FROM public.video_framing WHERE uploaded_video_id=v_video AND version='mediapipe-v1';
 RETURN v_id;
END $$;
