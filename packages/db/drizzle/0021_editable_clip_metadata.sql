ALTER TABLE "clip_candidates" ADD COLUMN "caption_baseline" jsonb;--> statement-breakpoint
ALTER TABLE "clip_candidates" ADD COLUMN "caption_edits" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "clip_candidates" ADD COLUMN "edit_revision" integer DEFAULT 0 NOT NULL;