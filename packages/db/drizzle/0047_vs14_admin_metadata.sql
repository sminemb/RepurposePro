-- The login role is provisioned by bootstrap tooling before owner migrations run.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM repurposepro_admin;
--> statement-breakpoint
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM repurposepro_admin;
--> statement-breakpoint
REVOKE CREATE ON SCHEMA public FROM repurposepro_admin;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO repurposepro_admin;
--> statement-breakpoint
GRANT SELECT (id, name, email, created_at, updated_at) ON public.users TO repurposepro_admin;
--> statement-breakpoint
GRANT SELECT (id, user_id, output_type, status, current_job_id, created_at, updated_at, deleted_at) ON public.projects TO repurposepro_admin;
--> statement-breakpoint
GRANT SELECT (id, user_id, amount_cents, currency, status, created_at) ON public.stripe_payments TO repurposepro_admin;
--> statement-breakpoint
GRANT SELECT (id, user_id, type, amount, created_at) ON public.credit_ledger TO repurposepro_admin;
--> statement-breakpoint
CREATE VIEW public.admin_job_metadata AS
SELECT id, user_id, project_id, type, status, step, attempt_count, started_at, completed_at, created_at, updated_at,
  CASE WHEN error_code IS NULL THEN NULL
    WHEN error_code IN ('ANALYSIS_RETRIES_EXHAUSTED','AUDIO_EXTRACTION_FAILED','FFMPEG_FAILED','GEMINI_FAILED','INVALID_AI_OUTPUT','STORAGE_FAILED','USER_CANCELLED','WHISPER_FAILED','WORKER_EXECUTION_LEASE_EXPIRED','WORKER_PERMANENT_FAILURE','SOURCE_VIDEO_EXPIRED') THEN error_code
    ELSE 'UNKNOWN_FAILURE' END AS error_code
FROM public.processing_jobs;
--> statement-breakpoint
GRANT SELECT ON public.admin_job_metadata TO repurposepro_admin;
--> statement-breakpoint
-- PUBLIC grants cannot be denied for one role. Preserve existing application access
-- before removing ambient execution, including functions with SECURITY DEFINER.
DO $$
DECLARE f record;
BEGIN
  FOR f IN SELECT p.oid::regprocedure AS signature,
    EXISTS (SELECT 1 FROM aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a
      WHERE a.grantee=0 AND a.privilege_type='EXECUTE') AS publicly_executable
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'
  LOOP
    IF f.publicly_executable THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO repurposepro_runtime,repurposepro_checkout,repurposepro_webhook,repurposepro_processing',f.signature);
    END IF;
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,repurposepro_admin',f.signature);
  END LOOP;
END $$;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES FOR ROLE repurposepro_owner REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
--> statement-breakpoint
CREATE INDEX users_admin_email_idx ON public.users (lower(email));
--> statement-breakpoint
CREATE INDEX users_admin_created_idx ON public.users (created_at DESC,id DESC);
--> statement-breakpoint
CREATE INDEX projects_admin_created_idx ON public.projects (created_at DESC,id DESC);
--> statement-breakpoint
CREATE INDEX jobs_admin_created_idx ON public.processing_jobs (created_at DESC,id DESC);
--> statement-breakpoint
CREATE INDEX payments_admin_created_idx ON public.stripe_payments (created_at DESC,id DESC);
--> statement-breakpoint
CREATE INDEX payments_admin_user_created_idx ON public.stripe_payments (user_id,created_at DESC,id DESC);
