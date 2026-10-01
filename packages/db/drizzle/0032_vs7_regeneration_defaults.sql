-- Carry the required position into a new candidate before promoting it.
CREATE OR REPLACE FUNCTION public.complete_clip_regeneration(p_job uuid,p_token uuid,p_candidate jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog,public,pg_temp AS $$
DECLARE j public.processing_jobs; r public.clip_regeneration_requests; c public.clip_candidates; duration numeric; s numeric; e numeric; replacement uuid;
BEGIN
 SELECT * INTO j FROM public.processing_jobs WHERE id=p_job AND type='regenerate_clip_candidate';
 IF NOT FOUND THEN RETURN NULL; END IF;
 PERFORM 1 FROM public.projects WHERE id=j.project_id AND current_job_id=p_job AND deleted_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RETURN NULL; END IF;
 SELECT * INTO j FROM public.processing_jobs WHERE id=p_job FOR UPDATE;
 SELECT * INTO r FROM public.clip_regeneration_requests WHERE job_id=p_job FOR UPDATE;
 IF j.status='completed' THEN RETURN r.replacement_clip_id; END IF;
 IF NOT public.touch_clip_regeneration(p_job,p_token) THEN RETURN NULL; END IF;
 SELECT * INTO c FROM public.clip_candidates WHERE id=r.clip_id FOR UPDATE;
 duration:=(r.snapshot->>'sourceDurationSeconds')::numeric; s:=(p_candidate->>'startTime')::numeric; e:=(p_candidate->>'endTime')::numeric;
 IF s IS NULL OR e IS NULL OR s<0 OR e>duration OR e-s<LEAST(15,duration) OR e-s>LEAST(180,duration) OR length(btrim(p_candidate->>'title')) NOT BETWEEN 1 AND 180
 OR EXISTS(SELECT 1 FROM public.clip_candidates x WHERE x.processing_job_id=r.analysis_job_id AND GREATEST(0,LEAST(e,x.end_time)-GREATEST(s,x.start_time))/LEAST(e-s,x.end_time-x.start_time)>=0.8) THEN RETURN NULL; END IF;
 INSERT INTO public.clip_candidates(project_id,processing_job_id,transcript_id,kind,rank,title,reason,score,start_time,end_time,caption_lines,caption_position)
 VALUES(j.project_id,r.analysis_job_id,c.transcript_id,'backup',(SELECT COALESCE(max(rank),-1)+1 FROM public.clip_candidates WHERE processing_job_id=r.analysis_job_id AND kind='backup' AND deleted_at IS NULL),p_candidate->>'title',p_candidate->>'reason',(p_candidate->>'score')::numeric,round(s,3),round(e,3),p_candidate->'captionLines',c.caption_position) RETURNING id INTO replacement;
 replacement:=public.replace_clip_candidate(c.id,replacement);
 UPDATE public.clip_regeneration_requests SET replacement_clip_id=replacement WHERE id=r.id;
 UPDATE public.processing_jobs SET status='completed',step='completed',progress=100,completed_at=now(),error_code=NULL,error_message=NULL,execution_lease_token=NULL,execution_lease_owner=NULL,execution_lease_expires_at=NULL,execution_heartbeat_at=NULL WHERE id=p_job;
 RETURN replacement;
END $$;

--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.complete_clip_render_item(p_job uuid,p_token uuid,p_clip uuid,p_output jsonb,p_retention integer) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog,public,pg_temp AS $$
DECLARE j public.processing_jobs; r public.render_request_items; v_output_id uuid;
BEGIN
 SELECT * INTO j FROM public.processing_jobs WHERE id=p_job AND type='render_clips';
 PERFORM 1 FROM public.projects WHERE id=j.project_id AND current_job_id=p_job AND deleted_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RETURN NULL; END IF;
 SELECT * INTO j FROM public.processing_jobs WHERE id=p_job FOR UPDATE;
 SELECT id INTO v_output_id FROM public.rendered_outputs WHERE render_job_id=p_job AND clip_candidate_id=p_clip AND storage_path=p_output->>'storagePath';
 IF v_output_id IS NOT NULL AND p_output->>'storagePath' LIKE '%/'||p_job::text||'/'||p_clip::text||'/'||p_token::text||'.mp4' THEN RETURN v_output_id; END IF;
 IF j.status<>'active' OR j.execution_lease_token IS DISTINCT FROM p_token OR j.execution_lease_expires_at<=clock_timestamp() OR p_retention NOT BETWEEN 1 AND 365 OR p_output->>'storagePath' NOT LIKE '%/'||p_job::text||'/'||p_clip::text||'/'||p_token::text||'.mp4' THEN RETURN NULL; END IF;
 PERFORM 1 FROM public.render_item_progress WHERE job_id=p_job AND clip_id=p_clip AND status='active';
 IF NOT FOUND THEN RETURN NULL; END IF;
 SELECT * INTO r FROM public.render_request_items WHERE job_id=p_job AND clip_id=p_clip;
 INSERT INTO public.rendered_outputs(project_id,render_job_id,clip_candidate_id,title,storage_path,file_name,file_size_bytes,duration_seconds,width,height,video_codec,audio_codec,expires_at)
 VALUES(j.project_id,p_job,p_clip,r.snapshot#>>'{clip,title}',p_output->>'storagePath',p_output->>'fileName',(p_output->>'fileSizeBytes')::bigint,(p_output->>'durationSeconds')::numeric,1080,1920,'h264','aac',clock_timestamp()+make_interval(days=>p_retention)) RETURNING id INTO v_output_id;
 UPDATE public.render_item_progress SET status='completed',step='completed',progress=100,output_id=v_output_id,error_code=NULL,error_message=NULL WHERE job_id=p_job AND clip_id=p_clip;
 PERFORM public.finish_clip_batch(p_job); RETURN v_output_id;
END $$;
