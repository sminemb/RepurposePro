CREATE TABLE "clip_regeneration_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"analysis_job_id" uuid NOT NULL,
	"clip_id" uuid NOT NULL,
	"expected_revision" integer NOT NULL,
	"idempotency_key" varchar(100) NOT NULL,
	"replacement_clip_id" uuid,
	"job_id" uuid,
	"source" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "clip_regeneration_requests_project_key_unique" UNIQUE("project_id","idempotency_key"),
	CONSTRAINT "clip_regeneration_requests_job_unique" UNIQUE("job_id"),
	CONSTRAINT "clip_regeneration_requests_revision_check" CHECK ("clip_regeneration_requests"."expected_revision">=0),
	CONSTRAINT "clip_regeneration_requests_source_check" CHECK ("clip_regeneration_requests"."source" IN ('backup_candidate','gemini_regeneration'))
);
--> statement-breakpoint
ALTER TABLE "clip_regeneration_requests" ADD CONSTRAINT "clip_regeneration_requests_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clip_regeneration_requests" ADD CONSTRAINT "clip_regeneration_requests_analysis_job_id_processing_jobs_id_fk" FOREIGN KEY ("analysis_job_id") REFERENCES "public"."processing_jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clip_regeneration_requests" ADD CONSTRAINT "clip_regeneration_requests_clip_id_clip_candidates_id_fk" FOREIGN KEY ("clip_id") REFERENCES "public"."clip_candidates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clip_regeneration_requests" ADD CONSTRAINT "clip_regeneration_requests_replacement_clip_id_clip_candidates_id_fk" FOREIGN KEY ("replacement_clip_id") REFERENCES "public"."clip_candidates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clip_regeneration_requests" ADD CONSTRAINT "clip_regeneration_requests_job_id_processing_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."processing_jobs"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE public.clip_regeneration_requests OWNER TO repurposepro_owner;
--> statement-breakpoint
REVOKE ALL ON public.clip_regeneration_requests FROM PUBLIC,repurposepro_runtime,repurposepro_processing,repurposepro_checkout,repurposepro_webhook;
--> statement-breakpoint
CREATE FUNCTION public.replace_clip_candidate(p_old uuid,p_new uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog,public,pg_temp AS $$
DECLARE c public.clip_candidates;
BEGIN
 SELECT * INTO c FROM public.clip_candidates WHERE id=p_old AND kind='primary' AND deleted_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RETURN NULL; END IF;
 PERFORM 1 FROM public.clip_candidates WHERE id=p_new AND project_id=c.project_id AND processing_job_id=c.processing_job_id AND transcript_id=c.transcript_id AND kind='backup' AND deleted_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RETURN NULL; END IF;
 UPDATE public.clip_candidates SET deleted_at=clock_timestamp(),selected=false,updated_at=clock_timestamp() WHERE id=c.id;
 UPDATE public.clip_candidates SET kind='primary',rank=c.rank,selected=c.selected,replaces_clip_id=c.id,
   captions_enabled=c.captions_enabled,caption_style=c.caption_style,preview_font_size=c.preview_font_size,caption_position=c.caption_position,caption_text_color=c.caption_text_color,
   crop=NULL,caption_baseline=NULL,caption_edits='[]'::jsonb,edit_revision=0,
   framing='{"mode":"follow","trackId":null,"offset":{"x":0,"y":0},"manualCenter":{"x":0.5,"y":0.5}}'::jsonb,updated_at=clock_timestamp() WHERE id=p_new;
 RETURN p_new;
END $$;
--> statement-breakpoint
CREATE FUNCTION public.clip_regeneration_reply(r public.clip_regeneration_requests) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO pg_catalog,public,pg_temp AS $$
 SELECT CASE WHEN r.source='backup_candidate' THEN jsonb_build_object('source',r.source,'replacementClipId',r.replacement_clip_id)
 ELSE jsonb_build_object('source',r.source,'jobId',r.job_id,'status',(SELECT status FROM public.processing_jobs WHERE id=r.job_id)) || CASE WHEN r.replacement_clip_id IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('replacementClipId',r.replacement_clip_id) END END;
$$;
--> statement-breakpoint
CREATE FUNCTION public.start_owned_clip_regeneration(p_user text,p_project uuid,p_clip uuid,p_revision integer,p_key text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog,public,pg_temp AS $$
DECLARE p public.projects; c public.clip_candidates; b public.clip_candidates; r public.clip_regeneration_requests; v public.uploaded_videos;
BEGIN
 SELECT * INTO p FROM public.projects WHERE id=p_project AND user_id=p_user AND deleted_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('error','CLIP_NOT_FOUND'); END IF;
 IF p_revision IS NULL OR p_revision<0 OR p_key IS NULL OR p_key !~ '^[a-zA-Z0-9_-]{1,100}$' THEN RETURN jsonb_build_object('error','VALIDATION_ERROR'); END IF;
 SELECT * INTO r FROM public.clip_regeneration_requests WHERE project_id=p.id AND idempotency_key=p_key;
 IF FOUND THEN
   IF r.clip_id<>p_clip OR r.expected_revision<>p_revision THEN RETURN jsonb_build_object('error','CLIP_REGENERATION_IDEMPOTENCY_CONFLICT'); END IF;
   RETURN public.clip_regeneration_reply(r);
 END IF;
 SELECT * INTO c FROM public.clip_candidates WHERE id=p_clip AND project_id=p.id AND processing_job_id=p.current_analysis_job_id AND kind='primary' AND deleted_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('error','CLIP_NOT_FOUND'); END IF;
 IF c.edit_revision<>p_revision THEN RETURN jsonb_build_object('error','CLIP_EDIT_CONFLICT'); END IF;
 IF EXISTS(SELECT 1 FROM public.processing_jobs WHERE project_id=p.id AND type IN ('render_clips','regenerate_clip_candidate') AND status IN ('queued','active')) THEN RETURN jsonb_build_object('error','CLIP_BUSY'); END IF;
 IF p.output_type<>'clips' OR p.status NOT IN ('preview_ready','waiting_for_user_edits','completed') OR NOT EXISTS(
   SELECT 1 FROM public.processing_jobs j JOIN public.credit_ledger l ON l.processing_job_id=j.id AND l.project_id=j.project_id AND l.user_id=j.user_id AND l.type='processing_deduction' AND l.amount=-j.credits_charged
   WHERE j.id=p.current_analysis_job_id AND j.project_id=p.id AND j.user_id=p_user AND j.type='analyze_video' AND j.status='completed' AND j.credits_charged>0
 ) THEN RETURN jsonb_build_object('error','CLIP_REGENERATION_NOT_AVAILABLE'); END IF;
 SELECT v0.* INTO v FROM public.uploaded_videos v0 JOIN public.transcripts t ON t.uploaded_video_id=v0.id WHERE t.id=c.transcript_id AND v0.project_id=p.id AND v0.deleted_at IS NULL;
 IF NOT FOUND THEN RETURN jsonb_build_object('error','SOURCE_VIDEO_NOT_FOUND'); END IF;
 IF v.expires_at<=clock_timestamp() THEN RETURN jsonb_build_object('error','SOURCE_VIDEO_EXPIRED'); END IF;
 SELECT * INTO b FROM public.clip_candidates WHERE project_id=p.id AND processing_job_id=c.processing_job_id AND transcript_id=c.transcript_id AND kind='backup' AND deleted_at IS NULL ORDER BY rank,id FOR UPDATE LIMIT 1;
 IF NOT FOUND THEN RETURN jsonb_build_object('error','CLIP_BACKUPS_EXHAUSTED'); END IF;
 PERFORM public.replace_clip_candidate(c.id,b.id);
 INSERT INTO public.clip_regeneration_requests(project_id,analysis_job_id,clip_id,expected_revision,idempotency_key,replacement_clip_id,source,snapshot)
 VALUES(p.id,p.current_analysis_job_id,c.id,p_revision,p_key,b.id,'backup_candidate',jsonb_build_object('sourceId',v.id,'transcriptId',c.transcript_id)) RETURNING * INTO r;
 RETURN public.clip_regeneration_reply(r);
END $$;
--> statement-breakpoint
ALTER FUNCTION public.replace_clip_candidate(uuid,uuid) OWNER TO repurposepro_owner;
--> statement-breakpoint
ALTER FUNCTION public.clip_regeneration_reply(public.clip_regeneration_requests) OWNER TO repurposepro_owner;
--> statement-breakpoint
ALTER FUNCTION public.start_owned_clip_regeneration(text,uuid,uuid,integer,text) OWNER TO repurposepro_owner;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.replace_clip_candidate(uuid,uuid), public.clip_regeneration_reply(public.clip_regeneration_requests),public.start_owned_clip_regeneration(text,uuid,uuid,integer,text) FROM PUBLIC,repurposepro_runtime,repurposepro_processing,repurposepro_checkout,repurposepro_webhook;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.start_owned_clip_regeneration(text,uuid,uuid,integer,text) TO repurposepro_runtime;
