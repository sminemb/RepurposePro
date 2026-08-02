CREATE TABLE "transcripts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"processing_job_id" uuid NOT NULL,
	"uploaded_video_id" uuid NOT NULL,
	"language" varchar(16) NOT NULL,
	"model" text NOT NULL,
	"duration_seconds" numeric(12, 3) NOT NULL,
	"text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transcripts_duration_check" CHECK ("transcripts"."duration_seconds" > 0),
	CONSTRAINT "transcripts_language_check" CHECK (length(btrim("transcripts"."language")) > 0),
	CONSTRAINT "transcripts_model_check" CHECK (length(btrim("transcripts"."model")) > 0),
	CONSTRAINT "transcripts_text_check" CHECK (length(btrim("transcripts"."text")) > 0)
);--> statement-breakpoint
CREATE TABLE "transcript_segments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transcript_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"start_seconds" numeric(12, 3) NOT NULL,
	"end_seconds" numeric(12, 3) NOT NULL,
	"text" text NOT NULL,
	"words" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transcript_segments_sequence_check" CHECK ("transcript_segments"."sequence" >= 0),
	CONSTRAINT "transcript_segments_start_check" CHECK ("transcript_segments"."start_seconds" >= 0),
	CONSTRAINT "transcript_segments_range_check" CHECK ("transcript_segments"."end_seconds" > "transcript_segments"."start_seconds"),
	CONSTRAINT "transcript_segments_text_check" CHECK (length(btrim("transcript_segments"."text")) > 0),
	CONSTRAINT "transcript_segments_words_check" CHECK ("transcript_segments"."words" IS NULL OR jsonb_typeof("transcript_segments"."words") = 'array')
);--> statement-breakpoint
ALTER TABLE "transcripts" ADD CONSTRAINT "transcripts_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transcripts" ADD CONSTRAINT "transcripts_processing_job_id_processing_jobs_id_fk" FOREIGN KEY ("processing_job_id") REFERENCES "public"."processing_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transcripts" ADD CONSTRAINT "transcripts_uploaded_video_id_uploaded_videos_id_fk" FOREIGN KEY ("uploaded_video_id") REFERENCES "public"."uploaded_videos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transcript_segments" ADD CONSTRAINT "transcript_segments_transcript_id_transcripts_id_fk" FOREIGN KEY ("transcript_id") REFERENCES "public"."transcripts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "transcripts_processing_job_id_unique" ON "transcripts" USING btree ("processing_job_id");--> statement-breakpoint
CREATE INDEX "transcripts_project_created_at_idx" ON "transcripts" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "transcript_segments_transcript_sequence_unique" ON "transcript_segments" USING btree ("transcript_id","sequence");--> statement-breakpoint
CREATE INDEX "transcript_segments_transcript_start_idx" ON "transcript_segments" USING btree ("transcript_id","start_seconds");--> statement-breakpoint

CREATE FUNCTION public.get_analysis_transcription_context(
  p_job_id uuid,
  p_worker_id text,
  p_lease_token uuid
)
RETURNS TABLE (
  outcome text,
  project_id uuid,
  source_path text,
  source_duration_seconds numeric,
  transcript jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog, public, pg_temp
AS $$
DECLARE
  v_job public.processing_jobs%ROWTYPE;
  v_transcript jsonb;
  v_video public.uploaded_videos%ROWTYPE;
BEGIN
  IF p_job_id IS NULL
    OR p_worker_id IS NULL
    OR p_worker_id = ''
    OR length(p_worker_id) > 200
    OR p_lease_token IS NULL THEN
    RAISE EXCEPTION 'analysis transcription context input is invalid' USING ERRCODE = '23514';
  END IF;

  SELECT *
  INTO v_job
  FROM public.processing_jobs AS job
  WHERE job.id = p_job_id;

  IF NOT FOUND
    OR v_job.type IS DISTINCT FROM 'analyze_video'
    OR v_job.status IS DISTINCT FROM 'active'
    OR v_job.execution_lease_owner IS DISTINCT FROM p_worker_id
    OR v_job.execution_lease_token IS DISTINCT FROM p_lease_token
    OR v_job.execution_lease_expires_at <= clock_timestamp() THEN
    RETURN QUERY SELECT 'lost', NULL::uuid, NULL::text, NULL::numeric, NULL::jsonb;
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.projects AS project
    WHERE project.id = v_job.project_id
      AND project.current_job_id = v_job.id
      AND project.deleted_at IS NULL
  ) THEN
    RETURN QUERY SELECT 'rejected', NULL::uuid, NULL::text, NULL::numeric, NULL::jsonb;
    RETURN;
  END IF;

  SELECT *
  INTO v_video
  FROM public.uploaded_videos AS video
  WHERE video.project_id = v_job.project_id;

  IF NOT FOUND OR NOT v_video.has_audio THEN
    RETURN QUERY SELECT 'rejected', NULL::uuid, NULL::text, NULL::numeric, NULL::jsonb;
    RETURN;
  END IF;

  SELECT jsonb_build_object(
    'id', transcript_record.id,
    'language', transcript_record.language,
    'model', transcript_record.model,
    'durationSeconds', transcript_record.duration_seconds,
    'text', transcript_record.text,
    'segments', COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'sequence', segment.sequence,
          'startSeconds', segment.start_seconds,
          'endSeconds', segment.end_seconds,
          'text', segment.text,
          'words', segment.words
        ) ORDER BY segment.sequence
      ) FILTER (WHERE segment.id IS NOT NULL),
      '[]'::jsonb
    )
  )
  INTO v_transcript
  FROM public.transcripts AS transcript_record
  LEFT JOIN public.transcript_segments AS segment
    ON segment.transcript_id = transcript_record.id
  WHERE transcript_record.processing_job_id = v_job.id
  GROUP BY transcript_record.id;

  IF v_transcript IS NOT NULL THEN
    RETURN QUERY SELECT
      'transcript_ready',
      v_job.project_id,
      v_video.storage_path,
      v_video.duration_seconds,
      v_transcript;
    RETURN;
  END IF;

  IF v_video.deleted_at IS NOT NULL OR v_video.expires_at <= clock_timestamp() THEN
    RETURN QUERY SELECT 'rejected', NULL::uuid, NULL::text, NULL::numeric, NULL::jsonb;
    RETURN;
  END IF;

  RETURN QUERY SELECT
    'ready',
    v_job.project_id,
    v_video.storage_path,
    v_video.duration_seconds,
    NULL::jsonb;
END;
$$;--> statement-breakpoint

CREATE FUNCTION public.persist_analysis_transcript(
  p_job_id uuid,
  p_worker_id text,
  p_lease_token uuid,
  p_language text,
  p_model text,
  p_duration_seconds numeric,
  p_text text,
  p_segments jsonb
)
RETURNS TABLE (outcome text, transcript_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog, public, pg_temp
AS $$
DECLARE
  v_job public.processing_jobs%ROWTYPE;
  v_segment_count integer;
  v_transcript_id uuid;
  v_video public.uploaded_videos%ROWTYPE;
BEGIN
  IF p_job_id IS NULL
    OR p_worker_id IS NULL
    OR p_worker_id = ''
    OR length(p_worker_id) > 200
    OR p_lease_token IS NULL
    OR p_language IS NULL
    OR length(btrim(p_language)) = 0
    OR length(p_language) > 16
    OR p_model IS NULL
    OR length(btrim(p_model)) = 0
    OR length(p_model) > 200
    OR p_duration_seconds IS NULL
    OR p_duration_seconds <= 0
    OR p_text IS NULL
    OR length(btrim(p_text)) = 0
    OR octet_length(p_text) > 16777216
    OR p_segments IS NULL
    OR jsonb_typeof(p_segments) <> 'array'
    OR octet_length(p_segments::text) > 16777216 THEN
    RAISE EXCEPTION 'analysis transcript input is invalid' USING ERRCODE = '23514';
  END IF;

  v_segment_count := jsonb_array_length(p_segments);
  IF v_segment_count < 1 OR v_segment_count > 100000 THEN
    RAISE EXCEPTION 'analysis transcript segment count is invalid' USING ERRCODE = '23514';
  END IF;

  SELECT *
  INTO v_job
  FROM public.processing_jobs AS job
  WHERE job.id = p_job_id
  FOR UPDATE;

  IF NOT FOUND
    OR v_job.type IS DISTINCT FROM 'analyze_video'
    OR v_job.status IS DISTINCT FROM 'active'
    OR v_job.execution_lease_owner IS DISTINCT FROM p_worker_id
    OR v_job.execution_lease_token IS DISTINCT FROM p_lease_token
    OR v_job.execution_lease_expires_at <= clock_timestamp() THEN
    RETURN QUERY SELECT 'lost', NULL::uuid;
    RETURN;
  END IF;

  SELECT transcript_record.id
  INTO v_transcript_id
  FROM public.transcripts AS transcript_record
  WHERE transcript_record.processing_job_id = v_job.id;

  IF FOUND THEN
    RETURN QUERY SELECT 'reused', v_transcript_id;
    RETURN;
  END IF;

  SELECT *
  INTO v_video
  FROM public.uploaded_videos AS video
  WHERE video.project_id = v_job.project_id
    AND video.deleted_at IS NULL
    AND video.expires_at > clock_timestamp();

  IF NOT FOUND
    OR NOT v_video.has_audio
    OR p_duration_seconds > v_video.duration_seconds + 0.001 THEN
    RETURN QUERY SELECT 'rejected', NULL::uuid;
    RETURN;
  END IF;

  IF (
    SELECT count(DISTINCT segment.sequence) <> v_segment_count
      OR min(segment.sequence) <> 0
      OR max(segment.sequence) <> v_segment_count - 1
      OR bool_or(segment."startSeconds" IS NULL OR segment."startSeconds" < 0)
      OR bool_or(
        segment."endSeconds" IS NULL
        OR segment."endSeconds" <= segment."startSeconds"
      )
      OR bool_or(segment."endSeconds" > v_video.duration_seconds + 0.001)
      OR bool_or(segment.text IS NULL)
      OR bool_or(length(btrim(segment.text)) = 0)
      OR bool_or(segment.words IS NOT NULL AND jsonb_typeof(segment.words) <> 'array')
    FROM jsonb_to_recordset(p_segments) AS segment(
      sequence integer,
      "startSeconds" numeric,
      "endSeconds" numeric,
      text text,
      words jsonb
    )
  ) THEN
    RAISE EXCEPTION 'analysis transcript segments are invalid' USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.transcripts (
    project_id,
    processing_job_id,
    uploaded_video_id,
    language,
    model,
    duration_seconds,
    text
  ) VALUES (
    v_job.project_id,
    v_job.id,
    v_video.id,
    btrim(p_language),
    btrim(p_model),
    p_duration_seconds,
    btrim(p_text)
  )
  RETURNING id INTO v_transcript_id;

  INSERT INTO public.transcript_segments (
    transcript_id,
    sequence,
    start_seconds,
    end_seconds,
    text,
    words
  )
  SELECT
    v_transcript_id,
    segment.sequence,
    segment."startSeconds",
    segment."endSeconds",
    btrim(segment.text),
    segment.words
  FROM jsonb_to_recordset(p_segments) AS segment(
    sequence integer,
    "startSeconds" numeric,
    "endSeconds" numeric,
    text text,
    words jsonb
  )
  ORDER BY segment.sequence;

  RETURN QUERY SELECT 'created', v_transcript_id;
END;
$$;--> statement-breakpoint

ALTER FUNCTION public.get_analysis_transcription_context(uuid, text, uuid)
  OWNER TO repurposepro_owner;--> statement-breakpoint
ALTER FUNCTION public.persist_analysis_transcript(uuid, text, uuid, text, text, numeric, text, jsonb)
  OWNER TO repurposepro_owner;--> statement-breakpoint

REVOKE ALL ON TABLE public.transcripts, public.transcript_segments
  FROM PUBLIC, repurposepro_runtime, repurposepro_checkout, repurposepro_webhook, repurposepro_processing;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.get_analysis_transcription_context(uuid, text, uuid)
  FROM PUBLIC, repurposepro_runtime, repurposepro_checkout, repurposepro_webhook;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.persist_analysis_transcript(uuid, text, uuid, text, text, numeric, text, jsonb)
  FROM PUBLIC, repurposepro_runtime, repurposepro_checkout, repurposepro_webhook;--> statement-breakpoint

GRANT EXECUTE ON FUNCTION public.get_analysis_transcription_context(uuid, text, uuid)
  TO repurposepro_processing;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.persist_analysis_transcript(uuid, text, uuid, text, text, numeric, text, jsonb)
  TO repurposepro_processing;
