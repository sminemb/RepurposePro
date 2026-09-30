CREATE TABLE public.video_framing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  uploaded_video_id uuid NOT NULL CONSTRAINT video_framing_uploaded_video_id_uploaded_videos_id_fk REFERENCES public.uploaded_videos(id) ON DELETE CASCADE,
  version text NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','active','completed','failed')),
  data jsonb,
  lease_token uuid,
  lease_expires_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT video_framing_uploaded_video_id_version_key UNIQUE(uploaded_video_id, version)
);--> statement-breakpoint
ALTER TABLE public.video_framing OWNER TO repurposepro_owner;--> statement-breakpoint
REVOKE ALL ON public.video_framing FROM PUBLIC, repurposepro_runtime, repurposepro_processing, repurposepro_checkout, repurposepro_webhook;--> statement-breakpoint

CREATE FUNCTION public.owned_video_framing(p_user text, p_project uuid, p_start boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog, public, pg_temp AS $$
DECLARE v_video uuid; v_result public.video_framing;
BEGIN
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
END $$;--> statement-breakpoint

CREATE FUNCTION public.request_job_framing(p_job uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog, public, pg_temp AS $$
DECLARE v_video uuid; v_id uuid;
BEGIN
 SELECT t.uploaded_video_id INTO v_video FROM public.processing_jobs j JOIN public.projects p ON p.id=j.project_id
 JOIN public.transcripts t ON t.processing_job_id=j.id JOIN public.uploaded_videos v ON v.id=t.uploaded_video_id
 WHERE j.id=p_job AND p.current_job_id=j.id AND p.deleted_at IS NULL AND v.deleted_at IS NULL AND v.expires_at>clock_timestamp();
 IF v_video IS NULL THEN RETURN NULL; END IF;
 INSERT INTO public.video_framing(uploaded_video_id,version) VALUES(v_video,'mediapipe-v1') ON CONFLICT DO NOTHING;
 SELECT id INTO v_id FROM public.video_framing WHERE uploaded_video_id=v_video AND version='mediapipe-v1';
 RETURN v_id;
END $$;--> statement-breakpoint

CREATE FUNCTION public.pending_video_framing()
RETURNS TABLE(id uuid) LANGUAGE sql SECURITY DEFINER SET search_path TO pg_catalog, public, pg_temp AS $$
 SELECT f.id FROM public.video_framing f JOIN public.uploaded_videos v ON v.id=f.uploaded_video_id
 JOIN public.projects p ON p.id=v.project_id
 WHERE (f.status='queued' OR (f.status='active' AND f.lease_expires_at<clock_timestamp()))
 AND v.deleted_at IS NULL AND p.deleted_at IS NULL AND v.expires_at>clock_timestamp()
 ORDER BY f.updated_at LIMIT 20;
$$;--> statement-breakpoint

CREATE FUNCTION public.claim_video_framing(p_id uuid, p_token uuid)
RETURNS TABLE(source_path text) LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog, public, pg_temp AS $$
BEGIN
 RETURN QUERY UPDATE public.video_framing f SET status='active',lease_token=p_token,lease_expires_at=clock_timestamp()+interval '20 minutes',updated_at=clock_timestamp()
 FROM public.uploaded_videos v, public.projects p
 WHERE f.id=p_id AND v.id=f.uploaded_video_id AND p.id=v.project_id AND v.deleted_at IS NULL AND p.deleted_at IS NULL AND v.expires_at>clock_timestamp()
 AND (f.status='queued' OR (f.status='active' AND f.lease_expires_at<clock_timestamp())) RETURNING v.storage_path;
END $$;--> statement-breakpoint

CREATE FUNCTION public.finish_video_framing(p_id uuid, p_token uuid, p_data jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog, public, pg_temp AS $$
BEGIN
 IF p_data IS NOT NULL AND (p_data->>'version' IS DISTINCT FROM 'mediapipe-v1' OR jsonb_typeof(p_data->'tracks') IS DISTINCT FROM 'array' OR (p_data->>'width')::numeric <= 0 OR (p_data->>'height')::numeric <= 0) THEN RETURN false; END IF;
 UPDATE public.video_framing f SET status=CASE WHEN p_data IS NULL THEN 'failed' ELSE 'completed' END,data=p_data,lease_token=NULL,lease_expires_at=NULL,updated_at=clock_timestamp()
 WHERE f.id=p_id AND f.lease_token=p_token AND f.status='active' AND f.lease_expires_at>clock_timestamp()
 AND EXISTS(SELECT 1 FROM public.uploaded_videos v JOIN public.projects p ON p.id=v.project_id WHERE v.id=f.uploaded_video_id AND v.deleted_at IS NULL AND p.deleted_at IS NULL);
 RETURN FOUND;
END $$;--> statement-breakpoint

ALTER FUNCTION public.owned_video_framing(text,uuid,boolean) OWNER TO repurposepro_owner;--> statement-breakpoint
ALTER FUNCTION public.request_job_framing(uuid) OWNER TO repurposepro_owner;--> statement-breakpoint
ALTER FUNCTION public.pending_video_framing() OWNER TO repurposepro_owner;--> statement-breakpoint
ALTER FUNCTION public.claim_video_framing(uuid,uuid) OWNER TO repurposepro_owner;--> statement-breakpoint
ALTER FUNCTION public.finish_video_framing(uuid,uuid,jsonb) OWNER TO repurposepro_owner;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.owned_video_framing(text,uuid,boolean),public.request_job_framing(uuid),public.pending_video_framing(),public.claim_video_framing(uuid,uuid),public.finish_video_framing(uuid,uuid,jsonb) FROM PUBLIC,repurposepro_runtime,repurposepro_processing,repurposepro_checkout,repurposepro_webhook;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.owned_video_framing(text,uuid,boolean) TO repurposepro_runtime;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.request_job_framing(uuid),public.pending_video_framing(),public.claim_video_framing(uuid,uuid),public.finish_video_framing(uuid,uuid,jsonb) TO repurposepro_processing;
