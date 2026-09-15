-- All caption times are source-video seconds. Cache the baseline on first save so
-- later trims never retime or discard the original generated captions.
CREATE FUNCTION public.clip_editor_baseline(p_candidate public.clip_candidates)
RETURNS jsonb LANGUAGE sql STABLE
SET search_path TO pg_catalog, public, pg_temp
AS $$
  SELECT COALESCE(p_candidate.caption_baseline, (
    WITH words AS (
      SELECT segment.sequence, segment.start_seconds, segment.end_seconds,
        word, ordinal, (ordinal - 1) / 7 AS chunk
      FROM public.transcript_segments AS segment,
        LATERAL regexp_split_to_table(btrim(segment.text), '\s+') WITH ORDINALITY AS tokens(word, ordinal)
      WHERE segment.transcript_id = p_candidate.transcript_id
    ), chunks AS (
      SELECT sequence, start_seconds, end_seconds, chunk,
        left(string_agg(word, ' ' ORDER BY ordinal), 160) AS text,
        count(*) OVER (PARTITION BY sequence) AS total
      FROM words GROUP BY sequence, start_seconds, end_seconds, chunk
    ), timed AS (
      SELECT *, start_seconds + (end_seconds - start_seconds) * chunk / total AS start_time,
        start_seconds + (end_seconds - start_seconds) * (chunk + 1) / total AS end_time
      FROM chunks
    ), lines AS (
      SELECT 'generated-' || ordinal || '-' || speech.sequence AS id,
        GREATEST((line->>'startTime')::numeric, speech.start_seconds) AS start_time,
        LEAST((line->>'endTime')::numeric, speech.end_seconds) AS end_time, line->>'text' AS text
      FROM jsonb_array_elements(p_candidate.caption_lines) WITH ORDINALITY AS generated(line, ordinal)
      JOIN public.transcript_segments AS speech ON speech.transcript_id = p_candidate.transcript_id
        AND speech.end_seconds > (line->>'startTime')::numeric
        AND speech.start_seconds < (line->>'endTime')::numeric
      UNION ALL
      SELECT 'source-' || sequence || '-' || chunk || '-before', start_time,
        LEAST(end_time, p_candidate.start_time), text FROM timed WHERE start_time < p_candidate.start_time
      UNION ALL
      SELECT 'source-' || sequence || '-' || chunk || '-after', GREATEST(start_time, p_candidate.end_time),
        end_time, text FROM timed WHERE end_time > p_candidate.end_time
    )
    SELECT COALESCE(jsonb_agg(jsonb_build_object('id', id, 'startTime', start_time,
      'endTime', end_time, 'text', text) ORDER BY start_time, end_time, id), '[]'::jsonb)
    FROM lines WHERE end_time > start_time
  ));
$$;--> statement-breakpoint

CREATE FUNCTION public.clip_editor_json(p_candidate public.clip_candidates, p_duration numeric)
RETURNS jsonb LANGUAGE sql STABLE
SET search_path TO pg_catalog, public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'clip', jsonb_build_object(
      'id', p_candidate.id, 'title', p_candidate.title, 'rank', p_candidate.rank, 'score', p_candidate.score,
      'startTime', p_candidate.start_time, 'endTime', p_candidate.end_time,
      'captionsEnabled', p_candidate.captions_enabled, 'captionStyle', p_candidate.caption_style,
      'captionPosition', p_candidate.caption_position, 'previewFontSize', p_candidate.preview_font_size,
      'crop', p_candidate.crop, 'revision', p_candidate.edit_revision, 'captionLines', p_candidate.caption_lines),
    'baseline', public.clip_editor_baseline(p_candidate), 'captionEdits', p_candidate.caption_edits,
    'sourceDurationSeconds', p_duration);
$$;--> statement-breakpoint

CREATE FUNCTION public.get_owned_clip_editor(p_user_id text, p_project_id uuid, p_clip_id uuid)
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

CREATE FUNCTION public.save_owned_clip_editor(p_user_id text, p_project_id uuid, p_clip_id uuid, p_input jsonb)
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
      'expectedRevision', 'startTime', 'endTime', 'captionsEnabled', 'captionPosition', 'previewFontSize', 'captionEdits']))
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
      OR (SELECT count(*) FROM jsonb_object_keys(edit)) <> 3
      OR EXISTS (SELECT 1 FROM jsonb_array_elements(edit->'highlights') AS word
        WHERE jsonb_typeof(word) <> 'string' OR length(btrim(word#>>'{}')) NOT BETWEEN 1 AND 64)
  ) THEN RETURN jsonb_build_object('outcome', 'CLIP_INVALID_CAPTION_METADATA'); END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', line->>'id',
    'startTime', GREATEST((line->>'startTime')::numeric, v_start),
    'endTime', LEAST((line->>'endTime')::numeric, v_end),
    'text', COALESCE(edit->>'text', line->>'text'), 'highlights', COALESCE(edit->'highlights', '[]'::jsonb))
    ORDER BY (line->>'startTime')::numeric, line->>'id'), '[]'::jsonb)
  INTO v_lines FROM jsonb_array_elements(v_baseline) AS line
  LEFT JOIN jsonb_array_elements(v_edits) AS edit ON edit->>'id' = line->>'id'
  WHERE (line->>'endTime')::numeric > v_start AND (line->>'startTime')::numeric < v_end;
  UPDATE public.clip_candidates SET start_time = v_start, end_time = v_end,
    captions_enabled = (p_input->>'captionsEnabled')::boolean,
    caption_position = p_input->'captionPosition', preview_font_size = (p_input->>'previewFontSize')::integer,
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
          'crop', candidate.crop,
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

