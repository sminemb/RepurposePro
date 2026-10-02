CREATE TABLE "storage_cleanup_targets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"asset_id" uuid,
	"project_id" uuid,
	"user_id" text NOT NULL,
	"job_id" uuid,
	"storage_path" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"deleted_at" timestamp with time zone,
	"writer_token" uuid,
	"writer_expires_at" timestamp with time zone,
	"lease_token" uuid,
	"lease_expires_at" timestamp with time zone,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "storage_cleanup_targets_storage_path_unique" UNIQUE("storage_path"),
	CONSTRAINT "storage_cleanup_kind_check" CHECK ("storage_cleanup_targets"."kind" IN ('source','output','audio','render_temp','upload_temp','orphan'))
);
--> statement-breakpoint
CREATE INDEX "storage_cleanup_pending_idx" ON "storage_cleanup_targets" USING btree ("expires_at","next_attempt_at") WHERE "storage_cleanup_targets"."deleted_at" IS NULL;