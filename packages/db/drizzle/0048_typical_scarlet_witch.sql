ALTER TABLE "storage_cleanup_targets" DROP CONSTRAINT "storage_cleanup_kind_check";--> statement-breakpoint
ALTER TABLE "storage_cleanup_targets" ADD CONSTRAINT "storage_cleanup_kind_check" CHECK ("storage_cleanup_targets"."kind" IN ('source','output','audio','render_temp','upload_temp','orphan','project'));
