-- The documented nested route verifies both project and job identity.
CREATE FUNCTION public.get_owned_project_job_status(p_user text,p_job uuid,p_project uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO pg_catalog,public,pg_temp AS $$
 SELECT public.get_owned_job_status(p_user,j.id) FROM public.processing_jobs j WHERE j.id=p_job AND (p_project IS NULL OR j.project_id=p_project);
$$;
--> statement-breakpoint
ALTER FUNCTION public.get_owned_project_job_status(text,uuid,uuid) OWNER TO repurposepro_owner;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.get_owned_project_job_status(text,uuid,uuid) FROM PUBLIC,repurposepro_runtime,repurposepro_processing,repurposepro_checkout,repurposepro_webhook;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.get_owned_project_job_status(text,uuid,uuid) TO repurposepro_runtime;
