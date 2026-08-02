CREATE FUNCTION public.list_owned_project_clip_candidates(p_user_id text, p_project_id uuid)
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
          'crop', candidate.crop,
          'endTime', candidate.end_time,
          'id', candidate.id,
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
          AND candidate_record.processing_job_id = project.current_job_id
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
$$;--> statement-breakpoint

CREATE FUNCTION public.get_owned_source_video_content(p_user_id text, p_project_id uuid)
RETURNS TABLE(
  storage_path text,
  mime_type text,
  file_size_bytes bigint,
  expires_at timestamptz,
  original_file_name text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO pg_catalog, public, pg_temp
AS $$
  SELECT
    video.storage_path,
    video.mime_type,
    video.file_size_bytes,
    video.expires_at,
    video.original_file_name
  FROM public.projects AS project
  JOIN LATERAL (
    SELECT video_record.*
    FROM public.uploaded_videos AS video_record
    WHERE video_record.project_id = project.id
      AND video_record.deleted_at IS NULL
    ORDER BY video_record.created_at DESC, video_record.id DESC
    LIMIT 1
  ) AS video ON true
  WHERE project.id = p_project_id
    AND project.user_id = p_user_id
    AND project.deleted_at IS NULL;
$$;--> statement-breakpoint

ALTER FUNCTION public.list_owned_project_clip_candidates(text, uuid)
  OWNER TO repurposepro_owner;--> statement-breakpoint
ALTER FUNCTION public.get_owned_source_video_content(text, uuid)
  OWNER TO repurposepro_owner;--> statement-breakpoint

REVOKE ALL ON FUNCTION public.list_owned_project_clip_candidates(text, uuid)
  FROM PUBLIC, repurposepro_checkout, repurposepro_processing, repurposepro_webhook;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.get_owned_source_video_content(text, uuid)
  FROM PUBLIC, repurposepro_checkout, repurposepro_processing, repurposepro_webhook;--> statement-breakpoint

GRANT EXECUTE ON FUNCTION public.list_owned_project_clip_candidates(text, uuid)
  TO repurposepro_runtime;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.get_owned_source_video_content(text, uuid)
  TO repurposepro_runtime;
