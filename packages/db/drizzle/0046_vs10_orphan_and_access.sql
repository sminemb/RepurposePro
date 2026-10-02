CREATE OR REPLACE FUNCTION public.remember_media_cleanup_target() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog,public,pg_temp AS $$
DECLARE owner_id text;
BEGIN
 SELECT user_id INTO owner_id FROM public.projects WHERE id=NEW.project_id;
 INSERT INTO public.storage_cleanup_targets(kind,asset_id,project_id,user_id,storage_path,expires_at,deleted_at)
 VALUES(CASE WHEN TG_TABLE_NAME='uploaded_videos' THEN 'source' ELSE 'output' END,NEW.id,NEW.project_id,owner_id,
 CASE WHEN TG_TABLE_NAME='uploaded_videos' THEN regexp_replace(replace(NEW.storage_path,chr(92),'/'),'/[^/]+$','') ELSE replace(NEW.storage_path,chr(92),'/') END,NEW.expires_at,NEW.deleted_at)
 ON CONFLICT(storage_path) DO UPDATE SET kind=EXCLUDED.kind,asset_id=EXCLUDED.asset_id,expires_at=EXCLUDED.expires_at,deleted_at=EXCLUDED.deleted_at;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.register_job_storage_target(p_job uuid,p_token uuid,p_path text,p_kind text,p_days integer DEFAULT 7) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog,public,pg_temp AS $$
DECLARE j public.processing_jobs; v public.uploaded_videos; target uuid; path text:=replace(p_path,chr(92),'/');
BEGIN
 SELECT * INTO j FROM public.processing_jobs WHERE id=p_job;
 IF NOT FOUND THEN RETURN NULL; END IF;
 PERFORM 1 FROM public.projects WHERE id=j.project_id FOR UPDATE;
 SELECT * INTO j FROM public.processing_jobs WHERE id=p_job;
 IF j.status<>'active' OR j.execution_lease_token IS DISTINCT FROM p_token OR j.execution_lease_expires_at<=clock_timestamp() OR p_kind NOT IN ('audio','render_temp') OR p_days NOT BETWEEN 1 AND 365 THEN RETURN NULL; END IF;
 SELECT * INTO v FROM public.uploaded_videos WHERE project_id=j.project_id AND deleted_at IS NULL;
 IF NOT FOUND OR NOT (position(p_job::text||'-'||p_token::text IN path)>0 OR (position('/'||p_job::text||'/' IN path)>0 AND path LIKE '%/'||p_token::text||'.mp4')) THEN RETURN NULL; END IF;
 INSERT INTO public.storage_cleanup_targets(kind,project_id,user_id,job_id,storage_path,expires_at)
 VALUES(p_kind,j.project_id,j.user_id,p_job,path,CASE WHEN p_kind='audio' THEN v.expires_at ELSE clock_timestamp()+make_interval(days=>p_days) END)
 ON CONFLICT(storage_path) DO UPDATE SET storage_path=EXCLUDED.storage_path RETURNING id INTO target;
 RETURN target;
END $$;
--> statement-breakpoint
CREATE FUNCTION public.register_upload_storage_aux(p_user text,p_project uuid,p_path text,p_days integer) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog,public,pg_temp AS $$
DECLARE writer uuid; target uuid; path text:=replace(p_path,chr(92),'/');
BEGIN
 PERFORM 1 FROM public.projects WHERE id=p_project AND user_id=p_user AND status='draft' AND deleted_at IS NULL FOR UPDATE;
 IF NOT FOUND OR p_days NOT BETWEEN 1 AND 365 OR NOT (path ~ '/\.staging/commit-[0-9a-f-]{36}$' OR path ~ ('/projects/'||p_project::text||'/(source|\.source-backup-[0-9a-f-]{36})$')) THEN RETURN NULL; END IF;
 SELECT writer_token INTO writer FROM public.storage_cleanup_targets WHERE project_id=p_project AND user_id=p_user AND kind='upload_temp' AND writer_expires_at>clock_timestamp() ORDER BY writer_expires_at DESC LIMIT 1;
 IF writer IS NULL THEN RETURN NULL; END IF;
 INSERT INTO public.storage_cleanup_targets(kind,project_id,user_id,storage_path,expires_at,writer_token,writer_expires_at)
 VALUES(CASE WHEN path LIKE '%/source' THEN 'source' ELSE 'upload_temp' END,p_project,p_user,path,clock_timestamp()+make_interval(days=>p_days),writer,clock_timestamp()+interval '60 seconds')
 ON CONFLICT(storage_path) DO UPDATE SET
 writer_token=EXCLUDED.writer_token,writer_expires_at=EXCLUDED.writer_expires_at,
 expires_at=EXCLUDED.expires_at,deleted_at=NULL,lease_token=NULL,lease_expires_at=NULL,
 attempt_count=0,next_attempt_at=clock_timestamp()
 WHERE storage_cleanup_targets.lease_token IS NULL OR storage_cleanup_targets.deleted_at IS NOT NULL
 RETURNING id INTO target;
 RETURN target;
END $$;
--> statement-breakpoint
CREATE FUNCTION public.list_cleanup_project_roots(p_after uuid,p_limit integer) RETURNS TABLE(project_id uuid,user_id text)
LANGUAGE sql SECURITY DEFINER SET search_path TO pg_catalog,public,pg_temp AS $$
 SELECT id,user_id FROM public.projects WHERE (p_after IS NULL OR id>p_after) ORDER BY id LIMIT LEAST(GREATEST(p_limit,1),1000);
$$;
--> statement-breakpoint
CREATE FUNCTION public.register_orphan_storage_target(p_project uuid,p_path text,p_created timestamptz,p_days integer) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog,public,pg_temp AS $$
DECLARE owner_id text; path text:=replace(p_path,chr(92),'/');
BEGIN
 IF p_days NOT BETWEEN 1 AND 365 OR p_created IS NULL OR p_created+make_interval(days=>p_days)>clock_timestamp() THEN RETURN false; END IF;
 IF p_project IS NOT NULL THEN
  SELECT user_id INTO owner_id FROM public.projects WHERE id=p_project FOR UPDATE;
  IF NOT FOUND OR public.storage_project_in_use(p_project) THEN RETURN false; END IF;
 ELSE
  owner_id:='orphan';
  IF NOT (path ~ '/\.staging/(commit-)?[0-9a-f-]{36}$' OR path ~ '/\.render-staging/[0-9a-f-]{36}-[0-9a-f-]{36}-([0-9a-f-]{36}|[a-zA-Z0-9]{6})$') THEN RETURN false; END IF;
 END IF;
 -- Existing registry entries and published resources always retain their own deadlines.
 IF EXISTS(SELECT 1 FROM public.storage_cleanup_targets WHERE storage_path=path)
 OR EXISTS(SELECT 1 FROM public.rendered_outputs WHERE replace(storage_path,chr(92),'/')=path)
 OR EXISTS(SELECT 1 FROM public.uploaded_videos WHERE regexp_replace(replace(storage_path,chr(92),'/'),'/[^/]+$','')=path) THEN RETURN false; END IF;
 IF p_project IS NULL AND EXISTS(SELECT 1 FROM public.processing_jobs j WHERE position(j.id::text IN path)>0 AND j.status='active' AND j.execution_lease_expires_at>clock_timestamp()) THEN RETURN false; END IF;
 INSERT INTO public.storage_cleanup_targets(kind,project_id,user_id,storage_path,expires_at) VALUES('orphan',p_project,owner_id,path,p_created+make_interval(days=>p_days)) ON CONFLICT DO NOTHING;
 RETURN FOUND;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.get_owned_source_video_content(p_user_id text,p_project_id uuid)
RETURNS TABLE(storage_path text,mime_type text,file_size_bytes bigint,expires_at timestamptz,original_file_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO pg_catalog,public,pg_temp AS $$
 SELECT v.storage_path,v.mime_type,v.file_size_bytes,v.expires_at,v.original_file_name
 FROM public.projects p JOIN public.uploaded_videos v ON v.project_id=p.id WHERE p.id=p_project_id AND p.user_id=p_user_id AND p.deleted_at IS NULL AND (v.deleted_at IS NULL OR v.expires_at<=clock_timestamp());
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.list_owned_render_outputs(p_user text,p_project uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO pg_catalog,public,pg_temp AS $$
 SELECT COALESCE((SELECT jsonb_agg(jsonb_build_object('id',o.id,'renderJobId',o.render_job_id,'clipId',o.clip_candidate_id,'type',o.type,'title',o.title,'durationSeconds',o.duration_seconds,'fileSizeBytes',o.file_size_bytes,'width',o.width,'height',o.height,'status',CASE WHEN o.status='expired' OR o.expires_at<=clock_timestamp() THEN 'expired' WHEN o.deleted_at IS NOT NULL THEN 'deleted' ELSE o.status END,'createdAt',o.created_at,'expiresAt',o.expires_at,'deletedAt',o.deleted_at) ORDER BY o.created_at DESC) FROM public.rendered_outputs o WHERE o.project_id=p.id),'[]'::jsonb)
 FROM public.projects p WHERE p.id=p_project AND p.user_id=p_user AND p.deleted_at IS NULL;
$$;
--> statement-breakpoint
CREATE FUNCTION public.expire_queued_media_job(p_job uuid,p_project uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog,public,pg_temp AS $$
DECLARE j public.processing_jobs;
BEGIN
 PERFORM 1 FROM public.projects WHERE id=p_project AND current_job_id=p_job AND deleted_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 SELECT * INTO j FROM public.processing_jobs WHERE id=p_job AND project_id=p_project FOR UPDATE;
 IF NOT FOUND OR j.status NOT IN ('queued','active') OR j.execution_lease_expires_at>clock_timestamp()
 OR NOT EXISTS(SELECT 1 FROM public.uploaded_videos WHERE project_id=p_project AND (deleted_at IS NOT NULL OR expires_at<=clock_timestamp())) THEN RETURN false; END IF;
 IF j.type='analyze_video' THEN
  PERFORM public.persist_processing_failure_intent(j.id,'STORAGE_FAILED','The source video expired before processing could finish.','source-expired');
 ELSIF j.type='render_clips' THEN PERFORM public.fail_clip_render(j.id,NULL,false,'SOURCE_VIDEO_EXPIRED');
 ELSIF j.type='render_summary' THEN PERFORM public.fail_summary_render(j.id,NULL,false);
 ELSIF j.type='regenerate_clip_candidate' THEN PERFORM public.fail_clip_regeneration(j.id,NULL,false);
 END IF;
 RETURN true;
END $$;
--> statement-breakpoint
ALTER FUNCTION public.acquire_analysis_execution_lease(uuid,uuid,text) RENAME TO acquire_analysis_execution_lease_pre_retention;
--> statement-breakpoint
CREATE FUNCTION public.acquire_analysis_execution_lease(p_job_id uuid,p_project_id uuid,p_worker_id text)
RETURNS TABLE(outcome text,lease_token uuid,expires_at timestamptz) LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog,public,pg_temp AS $$
BEGIN
 IF public.expire_queued_media_job(p_job_id,p_project_id) THEN RETURN QUERY SELECT 'rejected',NULL::uuid,NULL::timestamptz; RETURN; END IF;
 RETURN QUERY SELECT * FROM public.acquire_analysis_execution_lease_pre_retention(p_job_id,p_project_id,p_worker_id);
END $$;
--> statement-breakpoint
DO $$ DECLARE n text; BEGIN
 FOREACH n IN ARRAY ARRAY['acquire_clip_batch_render','acquire_clip_render','acquire_summary_render','acquire_clip_regeneration'] LOOP
  EXECUTE format('ALTER FUNCTION public.%I(uuid,uuid,uuid) RENAME TO %I',n,n||'_pre_retention');
  EXECUTE format('CREATE FUNCTION public.%I(p_job uuid,p_project uuid,p_token uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog,public,pg_temp AS $body$ BEGIN IF public.expire_queued_media_job(p_job,p_project) THEN RETURN jsonb_build_object(''terminal'',true); END IF; RETURN public.%I(p_job,p_project,p_token); END $body$',n,n||'_pre_retention');
  EXECUTE format('ALTER FUNCTION public.%I(uuid,uuid,uuid) OWNER TO repurposepro_owner',n);
  EXECUTE format('REVOKE ALL ON FUNCTION public.%I(uuid,uuid,uuid),public.%I(uuid,uuid,uuid) FROM PUBLIC,repurposepro_runtime,repurposepro_processing,repurposepro_checkout,repurposepro_webhook',n,n||'_pre_retention');
  EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(uuid,uuid,uuid) TO repurposepro_processing',n);
 END LOOP;
END $$;
--> statement-breakpoint
DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT oid::regprocedure signature FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN ('register_upload_storage_aux','list_cleanup_project_roots','register_orphan_storage_target','expire_queued_media_job','acquire_analysis_execution_lease','acquire_analysis_execution_lease_pre_retention') LOOP
  EXECUTE format('ALTER FUNCTION %s OWNER TO repurposepro_owner',f.signature);
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,repurposepro_runtime,repurposepro_processing,repurposepro_checkout,repurposepro_webhook',f.signature);
 END LOOP;
END $$;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.register_upload_storage_aux(text,uuid,text,integer) TO repurposepro_runtime;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.list_cleanup_project_roots(uuid,integer),public.register_orphan_storage_target(uuid,text,timestamptz,integer),public.acquire_analysis_execution_lease(uuid,uuid,text) TO repurposepro_processing;
--> statement-breakpoint
CREATE FUNCTION public.storage_cleanup_totals() RETURNS TABLE(pending bigint,deferred bigint)
LANGUAGE sql SECURITY DEFINER SET search_path TO pg_catalog,public,pg_temp AS $$
 SELECT count(*),count(*) FILTER(WHERE t.writer_expires_at>clock_timestamp() OR t.lease_expires_at>clock_timestamp() OR (t.kind<>'output' AND public.storage_project_in_use(t.project_id)))
 FROM public.storage_cleanup_targets t WHERE t.deleted_at IS NULL AND t.expires_at<=clock_timestamp();
$$;
--> statement-breakpoint
ALTER FUNCTION public.storage_cleanup_totals() OWNER TO repurposepro_owner;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.storage_cleanup_totals() FROM PUBLIC,repurposepro_runtime,repurposepro_processing,repurposepro_checkout,repurposepro_webhook;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.storage_cleanup_totals() TO repurposepro_processing;
--> statement-breakpoint
-- These three metadata operations retain ownership and edit fences after source bytes are gone.
DO $$ DECLARE f record; definition text; BEGIN
 FOR f IN SELECT oid FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN ('get_owned_clip_editor','save_owned_clip_editor','list_owned_project_clip_candidates') LOOP
  definition:=pg_get_functiondef(f.oid);
  definition:=replace(definition,'AND video.deleted_at IS NULL','');
  definition:=replace(definition,'AND video_record.deleted_at IS NULL','');
  EXECUTE definition;
 END LOOP;
END $$;
--> statement-breakpoint
-- Report expiration before delegating to existing ownership/state/idempotency rules.
DO $$ DECLARE f record; definition text; guard text; BEGIN
 FOR f IN SELECT oid,proname FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN ('start_owned_clip_batch_render','start_owned_summary_render','start_owned_clip_regeneration','owned_video_framing','start_paid_video_analysis') LOOP
  definition:=pg_get_functiondef(f.oid);
  IF f.proname='start_paid_video_analysis' THEN
   guard:='BEGIN IF EXISTS(SELECT 1 FROM public.projects retention_project JOIN public.uploaded_videos retention_video ON retention_video.project_id=retention_project.id WHERE retention_project.user_id=p_user_id AND retention_project.id=p_project_id AND retention_project.deleted_at IS NULL AND retention_video.expires_at<=clock_timestamp()) THEN RETURN QUERY SELECT ''video_expired''::text,NULL::uuid,p_project_id,NULL::public.processing_job_status,NULL::integer; RETURN; END IF;';
  ELSE
   guard:='BEGIN IF EXISTS(SELECT 1 FROM public.projects retention_project JOIN public.uploaded_videos retention_video ON retention_video.project_id=retention_project.id WHERE retention_project.user_id=p_user AND retention_project.id=p_project AND retention_project.deleted_at IS NULL AND retention_video.expires_at<=clock_timestamp()) THEN RETURN jsonb_build_object(''error'',''SOURCE_VIDEO_EXPIRED''); END IF;';
  END IF;
  EXECUTE regexp_replace(definition,'BEGIN',guard);
 END LOOP;
END $$;
