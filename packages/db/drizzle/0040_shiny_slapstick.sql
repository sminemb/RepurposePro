CREATE TABLE "analysis_stage_attempts" (
	"job_id" uuid NOT NULL,
	"stage" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_failure_code" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "analysis_stage_attempts_job_id_stage_pk" PRIMARY KEY("job_id","stage"),
	CONSTRAINT "analysis_stage_name_check" CHECK ("analysis_stage_attempts"."stage" IN ('transcription', 'selection')),
	CONSTRAINT "analysis_stage_budget_check" CHECK ("analysis_stage_attempts"."attempts" >= 0 AND "analysis_stage_attempts"."attempts" <= CASE WHEN "analysis_stage_attempts"."stage" = 'transcription' THEN 2 ELSE 3 END)
);
--> statement-breakpoint
ALTER TABLE "analysis_stage_attempts" ADD CONSTRAINT "analysis_stage_attempts_job_id_processing_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."processing_jobs"("id") ON DELETE cascade ON UPDATE no action;