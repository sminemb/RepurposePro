ALTER TABLE public.storage_cleanup_targets OWNER TO repurposepro_owner;
--> statement-breakpoint
REVOKE ALL ON public.storage_cleanup_targets FROM PUBLIC,repurposepro_runtime,repurposepro_processing,repurposepro_checkout,repurposepro_webhook;
--> statement-breakpoint
CREATE FUNCTION public.remember_media_cleanup_target() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog,public,pg_temp AS $$
DECLARE owner_id text;
BEGIN
 SELECT user_id INTO owner_id FROM public.projects WHERE id=NEW.project_id;
 INSERT INTO public.storage_cleanup_targets(kind,asset_id,project_id,user_id,storage_path,expires_at,deleted_at)
 VALUES(CASE WHEN TG_TABLE_NAME='uploaded_videos' THEN 'source' ELSE 'output' END,NEW.id,NEW.project_id,owner_id,
 CASE WHEN TG_TABLE_NAME='uploaded_videos' THEN regexp_replace(replace(NEW.storage_path,chr(92),'/'),'/[^/]+$','') ELSE replace(NEW.storage_path,chr(92),'/') END,NEW.expires_at,NEW.deleted_at)
 ON CONFLICT(storage_path) DO UPDATE SET expires_at=EXCLUDED.expires_at;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER uploaded_video_cleanup_target AFTER INSERT OR UPDATE OF expires_at,storage_path ON public.uploaded_videos FOR EACH ROW EXECUTE FUNCTION public.remember_media_cleanup_target();
--> statement-breakpoint
CREATE TRIGGER rendered_output_cleanup_target AFTER INSERT OR UPDATE OF expires_at,storage_path ON public.rendered_outputs FOR EACH ROW EXECUTE FUNCTION public.remember_media_cleanup_target();
--> statement-breakpoint
INSERT INTO public.storage_cleanup_targets(kind,asset_id,project_id,user_id,storage_path,expires_at,deleted_at)
SELECT 'source',v.id,v.project_id,p.user_id,regexp_replace(replace(v.storage_path,chr(92),'/'),'/[^/]+$',''),v.expires_at,v.deleted_at
FROM public.uploaded_videos v JOIN public.projects p ON p.id=v.project_id
UNION ALL SELECT 'output',o.id,o.project_id,p.user_id,replace(o.storage_path,chr(92),'/'),o.expires_at,o.deleted_at
FROM public.rendered_outputs o JOIN public.projects p ON p.id=o.project_id ON CONFLICT DO NOTHING;
--> statement-breakpoint
CREATE FUNCTION public.storage_project_in_use(p_project uuid) RETURNS boolean LANGUAGE sql STABLE SET search_path TO pg_catalog,public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM public.processing_jobs WHERE project_id=p_project AND status='active' AND execution_lease_expires_at>clock_timestamp())
 OR EXISTS(SELECT 1 FROM public.video_framing f JOIN public.uploaded_videos v ON v.id=f.uploaded_video_id WHERE v.project_id=p_project AND f.status='active' AND f.lease_expires_at>clock_timestamp());
$$;
--> statement-breakpoint
CREATE FUNCTION public.claim_expired_storage_targets(p_token uuid,p_limit integer) RETURNS SETOF public.storage_cleanup_targets
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog,public,pg_temp AS $$
DECLARE candidate public.storage_cleanup_targets; claimed public.storage_cleanup_targets;
BEGIN
 IF p_token IS NULL OR p_limit NOT BETWEEN 1 AND 1000 THEN RETURN; END IF;
 FOR candidate IN SELECT t.* FROM public.storage_cleanup_targets t WHERE t.deleted_at IS NULL AND t.expires_at<=clock_timestamp()
 AND t.next_attempt_at<=clock_timestamp() AND (t.lease_expires_at IS NULL OR t.lease_expires_at<=clock_timestamp())
 AND (t.writer_expires_at IS NULL OR t.writer_expires_at<=clock_timestamp())
 AND (t.kind='output' OR NOT public.storage_project_in_use(t.project_id)) ORDER BY t.expires_at,t.id LIMIT p_limit LOOP
  IF candidate.project_id IS NOT NULL THEN
   PERFORM 1 FROM public.projects WHERE id=candidate.project_id FOR UPDATE SKIP LOCKED;
   IF NOT FOUND THEN CONTINUE; END IF;
  END IF;
  IF candidate.kind<>'output' AND public.storage_project_in_use(candidate.project_id) THEN CONTINUE; END IF;
  SELECT * INTO claimed FROM public.storage_cleanup_targets WHERE id=candidate.id AND deleted_at IS NULL AND expires_at<=clock_timestamp() AND next_attempt_at<=clock_timestamp()
  AND (lease_expires_at IS NULL OR lease_expires_at<=clock_timestamp()) AND (writer_expires_at IS NULL OR writer_expires_at<=clock_timestamp()) FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN CONTINUE; END IF;
  UPDATE public.storage_cleanup_targets SET lease_token=p_token,lease_expires_at=clock_timestamp()+interval '5 minutes',attempt_count=attempt_count+1 WHERE id=claimed.id RETURNING * INTO claimed;
  RETURN NEXT claimed;
 END LOOP;
END $$;
--> statement-breakpoint
CREATE FUNCTION public.renew_storage_cleanup(p_id uuid,p_token uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog,public,pg_temp AS $$
BEGIN
 UPDATE public.storage_cleanup_targets SET lease_expires_at=clock_timestamp()+interval '5 minutes'
 WHERE id=p_id AND lease_token=p_token AND deleted_at IS NULL AND lease_expires_at>clock_timestamp();
 RETURN FOUND;
END $$;
--> statement-breakpoint
CREATE FUNCTION public.finish_storage_cleanup(p_id uuid,p_token uuid,p_success boolean) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog,public,pg_temp AS $$
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
 IF t.kind='source' THEN UPDATE public.uploaded_videos SET deleted_at=COALESCE(deleted_at,clock_timestamp()) WHERE id=t.asset_id AND expires_at<=clock_timestamp();
 ELSIF t.kind='output' THEN UPDATE public.rendered_outputs SET deleted_at=COALESCE(deleted_at,clock_timestamp()),status='expired' WHERE id=t.asset_id AND expires_at<=clock_timestamp(); END IF;
 UPDATE public.storage_cleanup_targets SET deleted_at=clock_timestamp(),lease_expires_at=NULL WHERE id=p_id;
 RETURN true;
END $$;
--> statement-breakpoint
CREATE FUNCTION public.register_job_storage_target(p_job uuid,p_token uuid,p_path text,p_kind text,p_days integer DEFAULT 7) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog,public,pg_temp AS $$
DECLARE j public.processing_jobs; v public.uploaded_videos; target uuid;
BEGIN
 SELECT * INTO j FROM public.processing_jobs WHERE id=p_job;
 IF NOT FOUND THEN RETURN NULL; END IF;
 PERFORM 1 FROM public.projects WHERE id=j.project_id FOR UPDATE;
 SELECT * INTO j FROM public.processing_jobs WHERE id=p_job;
 IF j.status<>'active' OR j.execution_lease_token IS DISTINCT FROM p_token OR j.execution_lease_expires_at<=clock_timestamp() OR p_kind NOT IN ('audio','render_temp') OR p_days NOT BETWEEN 1 AND 365 THEN RETURN NULL; END IF;
 SELECT * INTO v FROM public.uploaded_videos WHERE project_id=j.project_id AND deleted_at IS NULL;
 IF NOT FOUND OR position(p_job::text||'-'||p_token::text IN p_path)=0 THEN RETURN NULL; END IF;
 INSERT INTO public.storage_cleanup_targets(kind,project_id,user_id,job_id,storage_path,expires_at)
 VALUES(p_kind,j.project_id,j.user_id,p_job,replace(p_path,chr(92),'/'),CASE WHEN p_kind='audio' THEN v.expires_at ELSE clock_timestamp()+make_interval(days=>p_days) END)
 ON CONFLICT(storage_path) DO UPDATE SET storage_path=EXCLUDED.storage_path RETURNING id INTO target;
 RETURN target;
END $$;
--> statement-breakpoint
CREATE FUNCTION public.register_upload_storage_target(p_user text,p_project uuid,p_token uuid,p_path text,p_days integer) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog,public,pg_temp AS $$
DECLARE target uuid;
BEGIN
 PERFORM 1 FROM public.projects WHERE id=p_project AND user_id=p_user AND status='draft' AND deleted_at IS NULL FOR UPDATE;
 IF NOT FOUND OR p_token IS NULL OR p_days NOT BETWEEN 1 AND 365 OR p_path NOT LIKE '%/.staging/'||p_token::text THEN RETURN NULL; END IF;
 INSERT INTO public.storage_cleanup_targets(kind,project_id,user_id,storage_path,expires_at,writer_token,writer_expires_at)
 VALUES('upload_temp',p_project,p_user,p_path,clock_timestamp()+make_interval(days=>p_days),p_token,clock_timestamp()+interval '60 seconds') RETURNING id INTO target;
 RETURN target;
END $$;
--> statement-breakpoint
CREATE FUNCTION public.touch_upload_storage_target(p_token uuid,p_release boolean DEFAULT false) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog,public,pg_temp AS $$
BEGIN
 UPDATE public.storage_cleanup_targets SET writer_expires_at=CASE WHEN p_release THEN NULL ELSE clock_timestamp()+interval '60 seconds' END
 WHERE writer_token=p_token AND deleted_at IS NULL AND lease_token IS NULL AND writer_expires_at>clock_timestamp();
 RETURN FOUND;
END $$;
--> statement-breakpoint
CREATE FUNCTION public.guard_expired_execution_source() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog,public,pg_temp AS $$
BEGIN
 IF NEW.execution_lease_token IS NOT NULL AND NEW.execution_lease_token IS DISTINCT FROM OLD.execution_lease_token THEN
  PERFORM 1 FROM public.projects WHERE id=NEW.project_id FOR UPDATE;
  IF EXISTS(SELECT 1 FROM public.uploaded_videos WHERE project_id=NEW.project_id AND (deleted_at IS NOT NULL OR expires_at<=clock_timestamp())) THEN
   RAISE EXCEPTION 'SOURCE_VIDEO_EXPIRED' USING ERRCODE='55000';
  END IF;
 END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER processing_source_retention BEFORE UPDATE OF execution_lease_token ON public.processing_jobs FOR EACH ROW EXECUTE FUNCTION public.guard_expired_execution_source();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.claim_video_framing(p_id uuid,p_token uuid) RETURNS TABLE(source_path text) LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog,public,pg_temp AS $$
BEGIN
 PERFORM 1 FROM public.projects p JOIN public.uploaded_videos v ON v.project_id=p.id JOIN public.video_framing f ON f.uploaded_video_id=v.id WHERE f.id=p_id FOR UPDATE OF p;
 RETURN QUERY UPDATE public.video_framing f SET status='active',lease_token=p_token,lease_expires_at=clock_timestamp()+interval '20 minutes',updated_at=clock_timestamp()
 FROM public.uploaded_videos v,public.projects p WHERE f.id=p_id AND v.id=f.uploaded_video_id AND p.id=v.project_id AND v.deleted_at IS NULL AND p.deleted_at IS NULL AND v.expires_at>clock_timestamp()
 AND (f.status='queued' OR (f.status='active' AND f.lease_expires_at<clock_timestamp())) RETURNING v.storage_path;
END $$;
--> statement-breakpoint
DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT oid::regprocedure signature FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN ('remember_media_cleanup_target','storage_project_in_use','claim_expired_storage_targets','renew_storage_cleanup','finish_storage_cleanup','register_job_storage_target','register_upload_storage_target','touch_upload_storage_target','guard_expired_execution_source') LOOP
  EXECUTE format('ALTER FUNCTION %s OWNER TO repurposepro_owner',f.signature);
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,repurposepro_runtime,repurposepro_processing,repurposepro_checkout,repurposepro_webhook',f.signature);
 END LOOP;
END $$;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.claim_expired_storage_targets(uuid,integer),public.renew_storage_cleanup(uuid,uuid),public.finish_storage_cleanup(uuid,uuid,boolean),public.register_job_storage_target(uuid,uuid,text,text,integer) TO repurposepro_processing;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.register_upload_storage_target(text,uuid,uuid,text,integer),public.touch_upload_storage_target(uuid,boolean) TO repurposepro_runtime;
