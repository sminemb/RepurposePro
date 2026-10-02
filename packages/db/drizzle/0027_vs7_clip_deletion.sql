CREATE FUNCTION public.delete_owned_clip_candidate(p_user text,p_project uuid,p_clip uuid,p_revision integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog,public,pg_temp AS $$
DECLARE p public.projects; c public.clip_candidates;
BEGIN
 SELECT * INTO p FROM public.projects WHERE id=p_project AND user_id=p_user AND deleted_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('error','CLIP_NOT_FOUND'); END IF;
 SELECT * INTO c FROM public.clip_candidates WHERE id=p_clip AND project_id=p.id AND processing_job_id=p.current_analysis_job_id AND kind='primary' FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('error','CLIP_NOT_FOUND'); END IF;
 IF p_revision IS NULL OR c.edit_revision<>p_revision THEN RETURN jsonb_build_object('error','CLIP_EDIT_CONFLICT'); END IF;
 IF c.deleted_at IS NOT NULL THEN RETURN '{}'::jsonb; END IF;
 IF EXISTS(SELECT 1 FROM public.processing_jobs WHERE project_id=p.id AND type IN ('render_clips','regenerate_clip_candidate') AND status IN ('queued','active')) THEN RETURN jsonb_build_object('error','CLIP_BUSY'); END IF;
 UPDATE public.clip_candidates SET deleted_at=clock_timestamp(),selected=false,updated_at=clock_timestamp() WHERE id=c.id;
 RETURN '{}'::jsonb;
END $$;
--> statement-breakpoint
ALTER FUNCTION public.delete_owned_clip_candidate(text,uuid,uuid,integer) OWNER TO repurposepro_owner;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.delete_owned_clip_candidate(text,uuid,uuid,integer) FROM PUBLIC,repurposepro_runtime,repurposepro_processing,repurposepro_checkout,repurposepro_webhook;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.delete_owned_clip_candidate(text,uuid,uuid,integer) TO repurposepro_runtime;
