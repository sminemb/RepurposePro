ALTER TABLE public.clip_candidates ADD COLUMN caption_text_color varchar(7) NOT NULL DEFAULT '#FFFFFF';--> statement-breakpoint
ALTER TABLE public.clip_candidates ADD COLUMN framing jsonb;--> statement-breakpoint
-- Defaults apply only to newly generated clips; existing previews opt in through Save.
ALTER TABLE public.clip_candidates ALTER COLUMN framing SET DEFAULT '{"mode":"follow","trackId":null,"offset":{"x":0,"y":0},"manualCenter":{"x":0.5,"y":0.5}}'::jsonb;--> statement-breakpoint
CREATE FUNCTION public.valid_clip_framing(v jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path TO pg_catalog, public AS $$
BEGIN
 IF v IS NULL OR jsonb_typeof(v)<>'object' OR (SELECT count(*) FROM jsonb_object_keys(v))<>4 OR NOT v ?& ARRAY['mode','trackId','offset','manualCenter']
   OR v->>'mode' NOT IN ('follow','manual') OR jsonb_typeof(v->'mode')<>'string'
   OR NOT (v->'trackId'='null'::jsonb OR (jsonb_typeof(v->'trackId')='string' AND length(v->>'trackId') BETWEEN 1 AND 80)) THEN RETURN false; END IF;
 RETURN jsonb_typeof(v->'offset')='object' AND jsonb_typeof(v->'manualCenter')='object'
   AND (SELECT count(*) FROM jsonb_object_keys(v->'offset'))=2 AND (SELECT count(*) FROM jsonb_object_keys(v->'manualCenter'))=2
   AND v->'offset' ?& ARRAY['x','y'] AND v->'manualCenter' ?& ARRAY['x','y']
   AND jsonb_typeof(v#>'{offset,x}')='number' AND jsonb_typeof(v#>'{offset,y}')='number'
   AND jsonb_typeof(v#>'{manualCenter,x}')='number' AND jsonb_typeof(v#>'{manualCenter,y}')='number'
   AND (v#>>'{offset,x}')::numeric BETWEEN -1 AND 1 AND (v#>>'{offset,y}')::numeric BETWEEN -1 AND 1
   AND (v#>>'{manualCenter,x}')::numeric BETWEEN 0 AND 1 AND (v#>>'{manualCenter,y}')::numeric BETWEEN 0 AND 1;
EXCEPTION WHEN OTHERS THEN RETURN false;
END $$;--> statement-breakpoint
CREATE FUNCTION public.valid_highlight_colors(v jsonb, words jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path TO pg_catalog, public AS $$
BEGIN
 IF jsonb_typeof(v)<>'object' OR (SELECT count(*) FROM jsonb_object_keys(v))>10 THEN RETURN false; END IF;
 RETURN NOT EXISTS (SELECT 1 FROM jsonb_each(v) c WHERE c.key<>lower(btrim(c.key)) OR length(c.key) NOT BETWEEN 1 AND 64 OR jsonb_typeof(c.value)<>'string' OR c.value#>>'{}' !~ '^#[0-9A-Fa-f]{6}$'
   OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements_text(words) w WHERE lower(w)=c.key));
EXCEPTION WHEN OTHERS THEN RETURN false;
END $$;--> statement-breakpoint
ALTER FUNCTION public.valid_clip_framing(jsonb) OWNER TO repurposepro_owner;--> statement-breakpoint
ALTER FUNCTION public.valid_highlight_colors(jsonb,jsonb) OWNER TO repurposepro_owner;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.valid_clip_framing(jsonb),public.valid_highlight_colors(jsonb,jsonb) FROM PUBLIC;--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.clip_editor_json(p_candidate public.clip_candidates, p_duration numeric)
RETURNS jsonb LANGUAGE sql STABLE
SET search_path TO pg_catalog, public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'clip', jsonb_build_object(
      'id', p_candidate.id, 'title', p_candidate.title, 'rank', p_candidate.rank, 'score', p_candidate.score,
      'startTime', p_candidate.start_time, 'endTime', p_candidate.end_time,
      'captionsEnabled', p_candidate.captions_enabled, 'captionStyle', p_candidate.caption_style,
      'captionPosition', p_candidate.caption_position, 'previewFontSize', p_candidate.preview_font_size,
      'captionTextColor', p_candidate.caption_text_color, 'framing', p_candidate.framing, 'crop', p_candidate.crop, 'revision', p_candidate.edit_revision, 'captionLines', p_candidate.caption_lines),
    'baseline', public.clip_editor_baseline(p_candidate), 'captionEdits', p_candidate.caption_edits,
    'sourceDurationSeconds', p_duration);
$$;--> statement-breakpoint

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
    AND candidate.id = p_clip_id AND candidate.processing_job_id = project.current_job_id
    AND candidate.kind = 'primary' AND candidate.deleted_at IS NULL AND video.deleted_at IS NULL;
$$;--> statement-breakpoint

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
    AND processing_job_id = v_project.current_job_id AND kind = 'primary' AND deleted_at IS NULL FOR UPDATE;
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
$$;--> statement-breakpoint

ALTER FUNCTION public.clip_editor_baseline(public.clip_candidates) OWNER TO repurposepro_owner;--> statement-breakpoint
ALTER FUNCTION public.clip_editor_json(public.clip_candidates, numeric) OWNER TO repurposepro_owner;--> statement-breakpoint
ALTER FUNCTION public.get_owned_clip_editor(text, uuid, uuid) OWNER TO repurposepro_owner;--> statement-breakpoint
ALTER FUNCTION public.save_owned_clip_editor(text, uuid, uuid, jsonb) OWNER TO repurposepro_owner;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.clip_editor_baseline(public.clip_candidates),
  public.clip_editor_json(public.clip_candidates, numeric), public.get_owned_clip_editor(text, uuid, uuid),
  public.save_owned_clip_editor(text, uuid, uuid, jsonb)
  FROM PUBLIC, repurposepro_runtime, repurposepro_checkout, repurposepro_processing, repurposepro_webhook;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.get_owned_clip_editor(text, uuid, uuid),
  public.save_owned_clip_editor(text, uuid, uuid, jsonb) TO repurposepro_runtime;

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

