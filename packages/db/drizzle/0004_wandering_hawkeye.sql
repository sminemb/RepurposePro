CREATE TABLE "uploaded_videos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"original_file_name" text NOT NULL,
	"storage_path" text NOT NULL,
	"mime_type" text NOT NULL,
	"file_size_bytes" bigint NOT NULL,
	"duration_seconds" numeric(12, 3) NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"fps" numeric(12, 6),
	"video_codec" text,
	"audio_codec" text,
	"has_audio" boolean NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "uploaded_videos" ADD CONSTRAINT "uploaded_videos_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uploaded_videos_project_id_unique" ON "uploaded_videos" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "uploaded_videos_expires_at_idx" ON "uploaded_videos" USING btree ("expires_at");