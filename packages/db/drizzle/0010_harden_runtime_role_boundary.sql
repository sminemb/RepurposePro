CREATE OR REPLACE FUNCTION public.validate_project_current_job_ownership()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.current_job_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.processing_jobs
    WHERE id = NEW.current_job_id
      AND project_id = NEW.id
  ) THEN
    RAISE EXCEPTION 'current job must belong to its project' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;--> statement-breakpoint

ALTER FUNCTION public.validate_project_current_job_ownership()
SET search_path TO pg_catalog, public, pg_temp;--> statement-breakpoint

DO $$
BEGIN
  EXECUTE format('REVOKE CREATE, TEMPORARY ON DATABASE %I FROM PUBLIC', current_database());
END;
$$;
