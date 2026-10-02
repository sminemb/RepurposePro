CREATE FUNCTION public.is_owned_refunded_analysis_project(p_user_id text, p_project_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO pg_catalog, public, pg_temp AS $$
  SELECT EXISTS(SELECT 1 FROM public.projects WHERE id=p_project_id AND user_id=p_user_id
    AND status='refunded' AND deleted_at IS NULL);
$$;
--> statement-breakpoint
ALTER FUNCTION public.is_owned_refunded_analysis_project(text,uuid) OWNER TO repurposepro_owner;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.is_owned_refunded_analysis_project(text,uuid)
FROM PUBLIC,repurposepro_runtime,repurposepro_checkout,repurposepro_webhook;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.is_owned_refunded_analysis_project(text,uuid)
TO repurposepro_processing;
--> statement-breakpoint
-- Reassert the VS3 financial boundary after replacing the paid-start implementation.
REVOKE ALL ON FUNCTION public.start_paid_video_analysis(text,uuid)
FROM PUBLIC,repurposepro_runtime,repurposepro_checkout,repurposepro_webhook,repurposepro_processing;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.start_paid_video_analysis(text,uuid)
TO repurposepro_processing;
