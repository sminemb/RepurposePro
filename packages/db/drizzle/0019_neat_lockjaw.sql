CREATE TYPE "public"."clip_candidate_kind" AS ENUM('primary', 'backup');--> statement-breakpoint
CREATE TABLE "clip_candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"processing_job_id" uuid NOT NULL,
	"transcript_id" uuid NOT NULL,
	"kind" "clip_candidate_kind" NOT NULL,
	"rank" integer NOT NULL,
	"title" varchar(120) NOT NULL,
	"reason" varchar(500) NOT NULL,
	"start_time" numeric(12, 3) NOT NULL,
	"end_time" numeric(12, 3) NOT NULL,
	"score" numeric(5, 4) NOT NULL,
	"captions_enabled" boolean DEFAULT true NOT NULL,
	"caption_style" varchar(32) DEFAULT 'hormozi' NOT NULL,
	"caption_lines" jsonb NOT NULL,
	"caption_position" jsonb NOT NULL,
	"preview_font_size" integer DEFAULT 48 NOT NULL,
	"crop" jsonb,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "clip_candidates_rank_check" CHECK ("clip_candidates"."rank" >= 0 AND "clip_candidates"."rank" < 10),
	CONSTRAINT "clip_candidates_range_check" CHECK ("clip_candidates"."start_time" >= 0 AND "clip_candidates"."end_time" > "clip_candidates"."start_time"),
	CONSTRAINT "clip_candidates_score_check" CHECK ("clip_candidates"."score" >= 0 AND "clip_candidates"."score" <= 1),
	CONSTRAINT "clip_candidates_caption_lines_check" CHECK (jsonb_typeof("clip_candidates"."caption_lines") = 'array'),
	CONSTRAINT "clip_candidates_caption_position_check" CHECK (jsonb_typeof("clip_candidates"."caption_position") = 'object'),
	CONSTRAINT "clip_candidates_font_size_check" CHECK ("clip_candidates"."preview_font_size" >= 12 AND "clip_candidates"."preview_font_size" <= 96),
	CONSTRAINT "clip_candidates_crop_check" CHECK ("clip_candidates"."crop" IS NULL OR jsonb_typeof("clip_candidates"."crop") = 'object')
);
--> statement-breakpoint
ALTER TABLE "processing_jobs" ADD COLUMN "analysis_prompt_version" text;--> statement-breakpoint
ALTER TABLE "clip_candidates" ADD CONSTRAINT "clip_candidates_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clip_candidates" ADD CONSTRAINT "clip_candidates_processing_job_id_processing_jobs_id_fk" FOREIGN KEY ("processing_job_id") REFERENCES "public"."processing_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clip_candidates" ADD CONSTRAINT "clip_candidates_transcript_id_transcripts_id_fk" FOREIGN KEY ("transcript_id") REFERENCES "public"."transcripts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "clip_candidates_job_kind_rank_unique" ON "clip_candidates" USING btree ("processing_job_id","kind","rank");--> statement-breakpoint
CREATE INDEX "clip_candidates_project_primary_order_idx" ON "clip_candidates" USING btree ("project_id","rank","id") WHERE "clip_candidates"."kind" = 'primary' AND "clip_candidates"."deleted_at" IS NULL;
--> statement-breakpoint

CREATE FUNCTION public.is_analysis_preview_ready(p_job_id uuid, p_project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO pg_catalog, public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.processing_jobs AS job
    JOIN public.projects AS project
      ON project.id = job.project_id
    WHERE job.id = p_job_id
      AND job.project_id = p_project_id
      AND job.type = 'analyze_video'
      AND job.status = 'completed'
      AND job.step = 'preview_ready'
      AND job.progress = 100
      AND job.analysis_prompt_version = 'clips-v1'
      AND job.completed_at IS NOT NULL
      AND job.execution_lease_token IS NULL
      AND job.execution_lease_owner IS NULL
      AND job.execution_lease_expires_at IS NULL
      AND job.execution_heartbeat_at IS NULL
      AND project.current_job_id = job.id
      AND project.status = 'preview_ready'
      AND project.deleted_at IS NULL
      AND EXISTS (
        SELECT 1
        FROM public.clip_candidates AS candidate
        WHERE candidate.processing_job_id = job.id
          AND candidate.kind = 'primary'
          AND candidate.deleted_at IS NULL
      )
  );
$$;--> statement-breakpoint

CREATE FUNCTION public.finalize_analysis_preview(
  p_job_id uuid,
  p_worker_id text,
  p_lease_token uuid,
  p_prompt_version text,
  p_candidates jsonb
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog, public, pg_temp
AS $$
DECLARE
  v_backup_count integer;
  v_candidate_count integer;
  v_job public.processing_jobs%ROWTYPE;
  v_primary_count integer;
  v_source_duration numeric;
  v_transcript_id uuid;
BEGIN
  IF p_job_id IS NULL
    OR p_worker_id IS NULL
    OR p_worker_id = ''
    OR length(p_worker_id) > 200
    OR p_lease_token IS NULL
    OR p_prompt_version IS DISTINCT FROM 'clips-v1'
    OR p_candidates IS NULL
    OR jsonb_typeof(p_candidates) <> 'array'
    OR octet_length(p_candidates::text) > 4194304 THEN
    RAISE EXCEPTION 'analysis preview input is invalid' USING ERRCODE = '23514';
  END IF;

  IF public.is_analysis_preview_ready(p_job_id, (
    SELECT job.project_id FROM public.processing_jobs AS job WHERE job.id = p_job_id
  )) THEN
    RETURN 'existing';
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
    RETURN 'lost';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.projects AS project
    WHERE project.id = v_job.project_id
      AND project.current_job_id = v_job.id
      AND project.deleted_at IS NULL
  ) THEN
    RETURN 'rejected';
  END IF;

  SELECT transcript_record.id
  INTO v_transcript_id
  FROM public.transcripts AS transcript_record
  WHERE transcript_record.processing_job_id = v_job.id;

  SELECT video.duration_seconds
  INTO v_source_duration
  FROM public.uploaded_videos AS video
  WHERE video.project_id = v_job.project_id;

  IF v_transcript_id IS NULL OR v_source_duration IS NULL THEN
    RETURN 'rejected';
  END IF;

  v_candidate_count := jsonb_array_length(p_candidates);
  SELECT
    count(*) FILTER (WHERE candidate.kind = 'primary'),
    count(*) FILTER (WHERE candidate.kind = 'backup')
  INTO v_primary_count, v_backup_count
  FROM jsonb_to_recordset(p_candidates) AS candidate(kind text);

  IF v_candidate_count < 1
    OR v_candidate_count > 20
    OR v_primary_count < 1
    OR v_primary_count > 10
    OR v_backup_count > 10
    OR v_primary_count + v_backup_count <> v_candidate_count THEN
    RAISE EXCEPTION 'analysis preview candidate count is invalid' USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_candidates) AS candidate(
      kind text,
      rank integer,
      title text,
      reason text,
      "startTime" numeric,
      "endTime" numeric,
      score numeric,
      "captionsEnabled" boolean,
      "captionStyle" text,
      "captionLines" jsonb,
      "captionPosition" jsonb,
      "previewFontSize" integer,
      crop jsonb
    )
    WHERE candidate.kind NOT IN ('primary', 'backup')
      OR candidate.rank IS NULL
      OR candidate.rank < 0
      OR candidate.rank >= 10
      OR candidate.title IS NULL
      OR length(btrim(candidate.title)) = 0
      OR length(candidate.title) > 120
      OR candidate.reason IS NULL
      OR length(btrim(candidate.reason)) = 0
      OR length(candidate.reason) > 500
      OR candidate."startTime" IS NULL
      OR candidate."startTime" < 0
      OR candidate."endTime" IS NULL
      OR candidate."endTime" <= candidate."startTime"
      OR candidate."endTime" > v_source_duration + 0.001
      OR candidate."endTime" - candidate."startTime" < LEAST(15, v_source_duration) - 0.001
      OR candidate."endTime" - candidate."startTime" > LEAST(180, v_source_duration) + 0.001
      OR candidate.score IS NULL
      OR candidate.score < 0
      OR candidate.score > 1
      OR candidate."captionsEnabled" IS DISTINCT FROM true
      OR candidate."captionStyle" IS DISTINCT FROM 'hormozi'
      OR candidate."captionLines" IS NULL
      OR CASE
        WHEN jsonb_typeof(candidate."captionLines") = 'array'
          THEN jsonb_array_length(candidate."captionLines") < 1
        ELSE true
      END
      OR candidate."captionPosition" IS NULL
      OR CASE
        WHEN jsonb_typeof(candidate."captionPosition") = 'object'
          THEN NOT candidate."captionPosition" ?& ARRAY['x', 'y']
        ELSE true
      END
      OR CASE
        WHEN jsonb_typeof(candidate."captionPosition" -> 'x') = 'number'
          THEN (candidate."captionPosition" ->> 'x')::numeric NOT BETWEEN 0 AND 1
        ELSE true
      END
      OR CASE
        WHEN jsonb_typeof(candidate."captionPosition" -> 'y') = 'number'
          THEN (candidate."captionPosition" ->> 'y')::numeric NOT BETWEEN 0 AND 1
        ELSE true
      END
      OR candidate."previewFontSize" IS NULL
      OR candidate."previewFontSize" < 12
      OR candidate."previewFontSize" > 96
      OR (
        candidate.crop IS NOT NULL
        AND (
          CASE
            WHEN jsonb_typeof(candidate.crop) = 'object'
              THEN NOT candidate.crop ?& ARRAY['x', 'y', 'width', 'height']
            ELSE true
          END
          OR CASE
            WHEN jsonb_typeof(candidate.crop -> 'x') = 'number'
              THEN (candidate.crop ->> 'x')::numeric < 0
            ELSE true
          END
          OR CASE
            WHEN jsonb_typeof(candidate.crop -> 'y') = 'number'
              THEN (candidate.crop ->> 'y')::numeric < 0
            ELSE true
          END
          OR CASE
            WHEN jsonb_typeof(candidate.crop -> 'width') = 'number'
              THEN (candidate.crop ->> 'width')::numeric <= 0
            ELSE true
          END
          OR CASE
            WHEN jsonb_typeof(candidate.crop -> 'height') = 'number'
              THEN (candidate.crop ->> 'height')::numeric <= 0
            ELSE true
          END
          OR CASE
            WHEN jsonb_typeof(candidate.crop -> 'x') = 'number'
              AND jsonb_typeof(candidate.crop -> 'width') = 'number'
              THEN (candidate.crop ->> 'x')::numeric + (candidate.crop ->> 'width')::numeric > 1
            ELSE true
          END
          OR CASE
            WHEN jsonb_typeof(candidate.crop -> 'y') = 'number'
              AND jsonb_typeof(candidate.crop -> 'height') = 'number'
              THEN (candidate.crop ->> 'y')::numeric + (candidate.crop ->> 'height')::numeric > 1
            ELSE true
          END
        )
      )
  ) THEN
    RAISE EXCEPTION 'analysis preview candidate is invalid' USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (
      SELECT
        candidate.kind,
        count(*) AS candidate_count,
        count(DISTINCT candidate.rank) AS distinct_ranks,
        min(candidate.rank) AS minimum_rank,
        max(candidate.rank) AS maximum_rank
      FROM jsonb_to_recordset(p_candidates) AS candidate(kind text, rank integer)
      GROUP BY candidate.kind
    ) AS ranking
    WHERE ranking.distinct_ranks <> ranking.candidate_count
      OR ranking.minimum_rank <> 0
      OR ranking.maximum_rank <> ranking.candidate_count - 1
  ) THEN
    RAISE EXCEPTION 'analysis preview candidate ranking is invalid' USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_candidates) AS candidate(
      "startTime" numeric,
      "endTime" numeric,
      "captionLines" jsonb
    )
    CROSS JOIN LATERAL jsonb_array_elements(candidate."captionLines") AS line(value)
    WHERE jsonb_typeof(line.value) <> 'object'
      OR NOT line.value ?& ARRAY['startTime', 'endTime', 'text']
      OR length(btrim(line.value ->> 'text')) = 0
      OR (line.value ->> 'startTime')::numeric < candidate."startTime" - 0.001
      OR (line.value ->> 'endTime')::numeric <= (line.value ->> 'startTime')::numeric
      OR (line.value ->> 'endTime')::numeric > candidate."endTime" + 0.001
  ) THEN
    RAISE EXCEPTION 'analysis preview caption line is invalid' USING ERRCODE = '23514';
  END IF;

  DELETE FROM public.clip_candidates AS candidate
  WHERE candidate.processing_job_id = v_job.id;

  INSERT INTO public.clip_candidates (
    project_id,
    processing_job_id,
    transcript_id,
    kind,
    rank,
    title,
    reason,
    start_time,
    end_time,
    score,
    captions_enabled,
    caption_style,
    caption_lines,
    caption_position,
    preview_font_size,
    crop
  )
  SELECT
    v_job.project_id,
    v_job.id,
    v_transcript_id,
    candidate.kind::public.clip_candidate_kind,
    candidate.rank,
    btrim(candidate.title),
    btrim(candidate.reason),
    candidate."startTime",
    candidate."endTime",
    candidate.score,
    candidate."captionsEnabled",
    candidate."captionStyle",
    candidate."captionLines",
    candidate."captionPosition",
    candidate."previewFontSize",
    candidate.crop
  FROM jsonb_to_recordset(p_candidates) AS candidate(
    kind text,
    rank integer,
    title text,
    reason text,
    "startTime" numeric,
    "endTime" numeric,
    score numeric,
    "captionsEnabled" boolean,
    "captionStyle" text,
    "captionLines" jsonb,
    "captionPosition" jsonb,
    "previewFontSize" integer,
    crop jsonb
  )
  ORDER BY candidate.kind, candidate.rank;

  UPDATE public.processing_jobs AS job
  SET
    analysis_prompt_version = p_prompt_version,
    status = 'completed',
    step = 'preview_ready',
    progress = 100,
    completed_at = clock_timestamp(),
    execution_lease_token = NULL,
    execution_lease_owner = NULL,
    execution_lease_expires_at = NULL,
    execution_heartbeat_at = NULL,
    error_code = NULL,
    error_message = NULL,
    updated_at = clock_timestamp()
  WHERE job.id = v_job.id;

  UPDATE public.projects AS project
  SET status = 'preview_ready', updated_at = clock_timestamp()
  WHERE project.id = v_job.project_id
    AND project.current_job_id = v_job.id;

  RETURN 'created';
END;
$$;--> statement-breakpoint

ALTER FUNCTION public.is_analysis_preview_ready(uuid, uuid)
  OWNER TO repurposepro_owner;--> statement-breakpoint
ALTER FUNCTION public.finalize_analysis_preview(uuid, text, uuid, text, jsonb)
  OWNER TO repurposepro_owner;--> statement-breakpoint

REVOKE ALL ON TABLE public.clip_candidates
  FROM PUBLIC, repurposepro_runtime, repurposepro_checkout, repurposepro_webhook, repurposepro_processing;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.is_analysis_preview_ready(uuid, uuid)
  FROM PUBLIC, repurposepro_runtime, repurposepro_checkout, repurposepro_webhook;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.finalize_analysis_preview(uuid, text, uuid, text, jsonb)
  FROM PUBLIC, repurposepro_runtime, repurposepro_checkout, repurposepro_webhook;--> statement-breakpoint

GRANT EXECUTE ON FUNCTION public.is_analysis_preview_ready(uuid, uuid)
  TO repurposepro_processing;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.finalize_analysis_preview(uuid, text, uuid, text, jsonb)
  TO repurposepro_processing;
