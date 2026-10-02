CREATE TABLE "summaries" (
	"analysis_job_id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"edit_revision" integer DEFAULT 0 NOT NULL,
	"target_duration_seconds" numeric(12, 3) NOT NULL,
	CONSTRAINT "summary_revision_check" CHECK ("summaries"."edit_revision">=0),
	CONSTRAINT "summary_target_check" CHECK ("summaries"."target_duration_seconds">0)
);
--> statement-breakpoint
CREATE TABLE "summary_render_requests" (
	"job_id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"analysis_job_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "summary_render_revision_check" CHECK ("summary_render_requests"."revision">=0)
);
--> statement-breakpoint
CREATE TABLE "summary_segments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"analysis_job_id" uuid NOT NULL,
	"segment_order" integer NOT NULL,
	"start_time" numeric(12, 3) NOT NULL,
	"end_time" numeric(12, 3) NOT NULL,
	"reason" varchar(500) NOT NULL,
	"selected" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "summary_segment_order_unique" UNIQUE("analysis_job_id","segment_order"),
	CONSTRAINT "summary_segment_range_check" CHECK ("summary_segments"."start_time">=0 AND "summary_segments"."end_time">"summary_segments"."start_time"),
	CONSTRAINT "summary_segment_order_check" CHECK ("summary_segments"."segment_order">=0)
);
--> statement-breakpoint
ALTER TABLE "rendered_outputs" DROP CONSTRAINT "rendered_outputs_type_check";--> statement-breakpoint
ALTER TABLE "rendered_outputs" DROP CONSTRAINT "rendered_outputs_width_check";--> statement-breakpoint
ALTER TABLE "rendered_outputs" DROP CONSTRAINT "rendered_outputs_height_check";--> statement-breakpoint
ALTER TABLE "rendered_outputs" DROP CONSTRAINT "rendered_outputs_render_job_id_render_requests_job_id_fk";
--> statement-breakpoint
ALTER TABLE "rendered_outputs" ALTER COLUMN "clip_candidate_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "summaries" ADD CONSTRAINT "summaries_analysis_job_id_processing_jobs_id_fk" FOREIGN KEY ("analysis_job_id") REFERENCES "public"."processing_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "summaries" ADD CONSTRAINT "summaries_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "summaries" ADD CONSTRAINT "summaries_source_id_uploaded_videos_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."uploaded_videos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "summary_render_requests" ADD CONSTRAINT "summary_render_requests_job_id_processing_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."processing_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "summary_render_requests" ADD CONSTRAINT "summary_render_requests_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "summary_render_requests" ADD CONSTRAINT "summary_render_requests_analysis_job_id_summaries_analysis_job_id_fk" FOREIGN KEY ("analysis_job_id") REFERENCES "public"."summaries"("analysis_job_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "summary_segments" ADD CONSTRAINT "summary_segments_analysis_job_id_summaries_analysis_job_id_fk" FOREIGN KEY ("analysis_job_id") REFERENCES "public"."summaries"("analysis_job_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rendered_outputs" ADD CONSTRAINT "rendered_outputs_render_job_id_processing_jobs_id_fk" FOREIGN KEY ("render_job_id") REFERENCES "public"."processing_jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "rendered_outputs_summary_job_unique" ON "rendered_outputs" USING btree ("render_job_id") WHERE "rendered_outputs"."type"='summary';--> statement-breakpoint
ALTER TABLE "rendered_outputs" ADD CONSTRAINT "rendered_outputs_type_check" CHECK (("rendered_outputs"."type"='clip' AND "rendered_outputs"."clip_candidate_id" IS NOT NULL) OR ("rendered_outputs"."type"='summary' AND "rendered_outputs"."clip_candidate_id" IS NULL));--> statement-breakpoint
ALTER TABLE "rendered_outputs" ADD CONSTRAINT "rendered_outputs_width_check" CHECK (("rendered_outputs"."type"='clip' AND "rendered_outputs"."width"=1080) OR ("rendered_outputs"."type"='summary' AND "rendered_outputs"."width">0 AND "rendered_outputs"."width"%2=0));--> statement-breakpoint
ALTER TABLE "rendered_outputs" ADD CONSTRAINT "rendered_outputs_height_check" CHECK (("rendered_outputs"."type"='clip' AND "rendered_outputs"."height"=1920) OR ("rendered_outputs"."type"='summary' AND "rendered_outputs"."height">0 AND "rendered_outputs"."height"%2=0));