DROP INDEX "clip_candidates_job_kind_rank_unique";--> statement-breakpoint
ALTER TABLE "clip_candidates" ADD COLUMN "selected" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "clip_candidates" ADD COLUMN "replaces_clip_id" uuid;--> statement-breakpoint
ALTER TABLE "clip_candidates" ADD CONSTRAINT "clip_candidates_replaces_clip_id_clip_candidates_id_fk" FOREIGN KEY ("replaces_clip_id") REFERENCES "public"."clip_candidates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "clip_candidates_job_kind_rank_unique" ON "clip_candidates" USING btree ("processing_job_id","kind","rank") WHERE "clip_candidates"."deleted_at" IS NULL;--> statement-breakpoint
UPDATE public.clip_candidates SET selected=false WHERE kind='backup' OR deleted_at IS NOT NULL;--> statement-breakpoint
ALTER TABLE "clip_candidates" ADD CONSTRAINT "clip_candidates_selection_check" CHECK (NOT "clip_candidates"."selected" OR ("clip_candidates"."kind" = 'primary' AND "clip_candidates"."deleted_at" IS NULL));
--> statement-breakpoint
CREATE FUNCTION public.normalize_candidate_selection() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog,public,pg_temp AS $$
BEGIN
  IF NEW.kind='backup' OR NEW.deleted_at IS NOT NULL THEN NEW.selected:=false; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
ALTER FUNCTION public.normalize_candidate_selection() OWNER TO repurposepro_owner;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.normalize_candidate_selection() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER normalize_candidate_selection BEFORE INSERT OR UPDATE ON public.clip_candidates FOR EACH ROW EXECUTE FUNCTION public.normalize_candidate_selection();
--> statement-breakpoint
ALTER FUNCTION public.clip_editor_json(public.clip_candidates,numeric) RENAME TO clip_editor_json_v6;
--> statement-breakpoint
CREATE FUNCTION public.clip_editor_json(c public.clip_candidates,d numeric) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO pg_catalog,public,pg_temp AS $$
 SELECT public.clip_editor_json_v6(c,d) || jsonb_build_object('clip',(public.clip_editor_json_v6(c,d)->'clip') || jsonb_build_object('selected',c.selected));
$$;
--> statement-breakpoint
CREATE FUNCTION public.set_owned_clip_selection(p_user text,p_project uuid,p_clip uuid,p_selected boolean) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog,public,pg_temp AS $$
DECLARE p public.projects; c public.clip_candidates; d numeric;
BEGIN
 SELECT * INTO p FROM public.projects WHERE id=p_project AND user_id=p_user AND deleted_at IS NULL FOR UPDATE;
 IF NOT FOUND OR p_selected IS NULL THEN RETURN jsonb_build_object('error','CLIP_NOT_FOUND'); END IF;
 SELECT * INTO c FROM public.clip_candidates WHERE id=p_clip AND project_id=p.id AND processing_job_id=p.current_analysis_job_id AND kind='primary' AND deleted_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('error','CLIP_NOT_FOUND'); END IF;
 UPDATE public.clip_candidates SET selected=p_selected,updated_at=clock_timestamp() WHERE id=c.id RETURNING * INTO c;
 SELECT duration_seconds INTO d FROM public.transcripts WHERE id=c.transcript_id;
 RETURN public.clip_editor_json(c,d)->'clip';
END $$;
--> statement-breakpoint
ALTER FUNCTION public.clip_editor_json(public.clip_candidates,numeric) OWNER TO repurposepro_owner;
--> statement-breakpoint
ALTER FUNCTION public.set_owned_clip_selection(text,uuid,uuid,boolean) OWNER TO repurposepro_owner;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.clip_editor_json(public.clip_candidates,numeric), public.set_owned_clip_selection(text,uuid,uuid,boolean) FROM PUBLIC,repurposepro_runtime,repurposepro_processing,repurposepro_checkout,repurposepro_webhook;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.set_owned_clip_selection(text,uuid,uuid,boolean) TO repurposepro_runtime;

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
          'revision', candidate.edit_revision, 'selected', candidate.selected,
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
