-- Regeneration uses the analysis queue but has its own zero-credit lifecycle.
ALTER FUNCTION public.start_owned_clip_regeneration(text,uuid,uuid,integer,text) RENAME TO start_owned_clip_regeneration_backup;
--> statement-breakpoint
CREATE FUNCTION public.start_owned_clip_regeneration(p_user text,p_project uuid,p_clip uuid,p_revision integer,p_key text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog,public,pg_temp AS $$
DECLARE reply jsonb; p public.projects; c public.clip_candidates; r public.clip_regeneration_requests; new_job uuid; snap jsonb;
BEGIN
 reply:=public.start_owned_clip_regeneration_backup(p_user,p_project,p_clip,p_revision,p_key);
 IF reply->>'error' IS DISTINCT FROM 'CLIP_BACKUPS_EXHAUSTED' THEN RETURN reply; END IF;
 SELECT * INTO p FROM public.projects WHERE id=p_project AND user_id=p_user AND deleted_at IS NULL FOR UPDATE;
 SELECT * INTO c FROM public.clip_candidates WHERE id=p_clip FOR UPDATE;
 SELECT jsonb_build_object('sourceDurationSeconds',v.duration_seconds,'sourceId',v.id,'transcriptId',c.transcript_id,
   'transcript',COALESCE((SELECT jsonb_agg(jsonb_build_object('startSeconds',s.start_seconds,'endSeconds',s.end_seconds,'text',s.text) ORDER BY s.sequence) FROM public.transcript_segments s WHERE s.transcript_id=c.transcript_id),'[]'::jsonb),
   'excludedCandidates',COALESCE((SELECT jsonb_agg(jsonb_build_object('startTime',x.start_time,'endTime',x.end_time)) FROM public.clip_candidates x WHERE x.processing_job_id=p.current_analysis_job_id),'[]'::jsonb)) INTO snap
 FROM public.transcripts t JOIN public.uploaded_videos v ON v.id=t.uploaded_video_id WHERE t.id=c.transcript_id;
 INSERT INTO public.processing_jobs(project_id,user_id,type,status,step,progress,credits_charged,refund_eligible)
 VALUES(p.id,p.user_id,'regenerate_clip_candidate','queued','queued',0,0,false) RETURNING id INTO new_job;
 INSERT INTO public.clip_regeneration_requests(project_id,analysis_job_id,clip_id,expected_revision,idempotency_key,job_id,source,snapshot)
 VALUES(p.id,p.current_analysis_job_id,c.id,p_revision,p_key,new_job,'gemini_regeneration',snap) RETURNING * INTO r;
 INSERT INTO public.processing_job_dispatches(processing_job_id) VALUES(new_job);
 UPDATE public.projects SET current_job_id=new_job,status='preview_ready',updated_at=now() WHERE id=p.id;
 RETURN public.clip_regeneration_reply(r);
END $$;
--> statement-breakpoint
CREATE FUNCTION public.acquire_clip_regeneration(p_job uuid,p_project uuid,p_token uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog,public,pg_temp AS $$
DECLARE j public.processing_jobs; r public.clip_regeneration_requests;
BEGIN
 PERFORM 1 FROM public.projects WHERE id=p_project AND current_job_id=p_job AND deleted_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RETURN NULL; END IF;
 SELECT * INTO j FROM public.processing_jobs WHERE id=p_job AND project_id=p_project AND type='regenerate_clip_candidate' FOR UPDATE;
 IF j.status IN ('completed','failed') THEN RETURN jsonb_build_object('terminal',true); END IF;
 IF j.status NOT IN ('queued','active') OR j.attempt_count>=2 OR j.execution_lease_expires_at>clock_timestamp() THEN RETURN NULL; END IF;
 SELECT * INTO r FROM public.clip_regeneration_requests WHERE job_id=p_job;
 IF NOT EXISTS(SELECT 1 FROM public.projects p JOIN public.clip_candidates c ON c.id=r.clip_id WHERE p.id=p_project AND p.current_analysis_job_id=r.analysis_job_id AND c.deleted_at IS NULL AND c.edit_revision=r.expected_revision) THEN RETURN NULL; END IF;
 UPDATE public.processing_jobs SET status='active',step='analyzing',progress=10,attempt_count=attempt_count+1,started_at=COALESCE(started_at,now()),execution_lease_token=p_token,execution_lease_owner='regeneration-worker',execution_lease_expires_at=clock_timestamp()+interval '60 seconds',execution_heartbeat_at=clock_timestamp() WHERE id=p_job;
 RETURN r.snapshot;
END $$;
--> statement-breakpoint
CREATE FUNCTION public.touch_clip_regeneration(p_job uuid,p_token uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog,public,pg_temp AS $$
BEGIN
 UPDATE public.processing_jobs j SET execution_heartbeat_at=clock_timestamp(),execution_lease_expires_at=clock_timestamp()+interval '60 seconds'
 WHERE j.id=p_job AND j.type='regenerate_clip_candidate' AND j.status='active' AND j.execution_lease_token=p_token AND j.execution_lease_expires_at>clock_timestamp()
 AND EXISTS(SELECT 1 FROM public.projects p JOIN public.clip_regeneration_requests r ON r.job_id=j.id JOIN public.clip_candidates c ON c.id=r.clip_id WHERE p.id=j.project_id AND p.current_job_id=j.id AND p.current_analysis_job_id=r.analysis_job_id AND p.deleted_at IS NULL AND c.deleted_at IS NULL AND c.edit_revision=r.expected_revision);
 RETURN FOUND;
END $$;
--> statement-breakpoint
CREATE FUNCTION public.fail_clip_regeneration(p_job uuid,p_token uuid,p_retry boolean) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog,public,pg_temp AS $$
DECLARE j public.processing_jobs;
BEGIN
 SELECT * INTO j FROM public.processing_jobs WHERE id=p_job AND type='regenerate_clip_candidate';
 IF NOT FOUND THEN RETURN false; END IF;
 PERFORM 1 FROM public.projects WHERE id=j.project_id FOR UPDATE;
 SELECT * INTO j FROM public.processing_jobs WHERE id=p_job FOR UPDATE;
 IF j.status NOT IN ('queued','active') OR (p_token IS NOT NULL AND (j.execution_lease_token IS DISTINCT FROM p_token OR j.execution_lease_expires_at<=clock_timestamp())) OR (p_token IS NULL AND j.execution_lease_expires_at>clock_timestamp()) THEN RETURN false; END IF;
 p_retry:=p_retry AND j.attempt_count<2;
 UPDATE public.processing_jobs SET status=CASE WHEN p_retry THEN 'queued'::public.processing_job_status ELSE 'failed'::public.processing_job_status END,step=CASE WHEN p_retry THEN 'queued'::public.processing_step ELSE 'failed'::public.processing_step END,
 error_code='CLIP_REGENERATION_FAILED',error_message='A replacement could not be found. Your original clip is safe; try regenerating again.',completed_at=CASE WHEN p_retry THEN NULL ELSE now() END,
 execution_lease_token=NULL,execution_lease_owner=NULL,execution_lease_expires_at=NULL,execution_heartbeat_at=NULL WHERE id=p_job;
 RETURN true;
END $$;
--> statement-breakpoint
CREATE FUNCTION public.complete_clip_regeneration(p_job uuid,p_token uuid,p_candidate jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog,public,pg_temp AS $$
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
 INSERT INTO public.clip_candidates(project_id,processing_job_id,transcript_id,kind,rank,title,reason,score,start_time,end_time,caption_lines)
 VALUES(j.project_id,r.analysis_job_id,c.transcript_id,'backup',(SELECT COALESCE(max(rank),-1)+1 FROM public.clip_candidates WHERE processing_job_id=r.analysis_job_id AND kind='backup' AND deleted_at IS NULL),p_candidate->>'title',p_candidate->>'reason',(p_candidate->>'score')::numeric,round(s,3),round(e,3),p_candidate->'captionLines') RETURNING id INTO replacement;
 replacement:=public.replace_clip_candidate(c.id,replacement);
 UPDATE public.clip_regeneration_requests SET replacement_clip_id=replacement WHERE id=r.id;
 UPDATE public.processing_jobs SET status='completed',step='completed',progress=100,completed_at=now(),error_code=NULL,error_message=NULL,execution_lease_token=NULL,execution_lease_owner=NULL,execution_lease_expires_at=NULL,execution_heartbeat_at=NULL WHERE id=p_job;
 RETURN replacement;
END $$;
--> statement-breakpoint
-- Immutable request identity and transcript; only the completion reference may change.
CREATE FUNCTION public.protect_regeneration_request() RETURNS trigger LANGUAGE plpgsql SET search_path TO pg_catalog,public,pg_temp AS $$
BEGIN
 IF (to_jsonb(NEW)-'replacement_clip_id') IS DISTINCT FROM (to_jsonb(OLD)-'replacement_clip_id') OR OLD.replacement_clip_id IS NOT NULL THEN RAISE EXCEPTION 'regeneration request is immutable' USING ERRCODE='55000'; END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER regeneration_request_immutable BEFORE UPDATE ON public.clip_regeneration_requests FOR EACH ROW EXECUTE FUNCTION public.protect_regeneration_request();
--> statement-breakpoint
ALTER FUNCTION public.start_owned_clip_regeneration(text,uuid,uuid,integer,text) OWNER TO repurposepro_owner;
--> statement-breakpoint
ALTER FUNCTION public.acquire_clip_regeneration(uuid,uuid,uuid) OWNER TO repurposepro_owner;
--> statement-breakpoint
ALTER FUNCTION public.touch_clip_regeneration(uuid,uuid) OWNER TO repurposepro_owner;
--> statement-breakpoint
ALTER FUNCTION public.fail_clip_regeneration(uuid,uuid,boolean) OWNER TO repurposepro_owner;
--> statement-breakpoint
ALTER FUNCTION public.complete_clip_regeneration(uuid,uuid,jsonb) OWNER TO repurposepro_owner;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.start_owned_clip_regeneration_backup(text,uuid,uuid,integer,text),public.start_owned_clip_regeneration(text,uuid,uuid,integer,text),public.acquire_clip_regeneration(uuid,uuid,uuid),public.touch_clip_regeneration(uuid,uuid),public.fail_clip_regeneration(uuid,uuid,boolean),public.complete_clip_regeneration(uuid,uuid,jsonb) FROM PUBLIC,repurposepro_runtime,repurposepro_processing,repurposepro_checkout,repurposepro_webhook;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.start_owned_clip_regeneration(text,uuid,uuid,integer,text) TO repurposepro_runtime;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.acquire_clip_regeneration(uuid,uuid,uuid),public.touch_clip_regeneration(uuid,uuid),public.fail_clip_regeneration(uuid,uuid,boolean),public.complete_clip_regeneration(uuid,uuid,jsonb) TO repurposepro_processing;

--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.save_owned_clip_editor(p_user_id text, p_project_id uuid, p_clip_id uuid, p_input jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO pg_catalog, public, pg_temp
AS $$
DECLARE
  v_project public.projects%ROWTYPE;
  v_candidate public.clip_candidates%ROWTYPE;
  v_duration numeric;
  v_start numeric;
  v_end numeric;
  v_baseline jsonb;
  v_edits jsonb;
  v_lines jsonb;
BEGIN
  SELECT * INTO v_project FROM public.projects WHERE id = p_project_id AND user_id = p_user_id
    AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('outcome', 'CLIP_NOT_FOUND'); END IF;
  IF EXISTS(SELECT 1 FROM public.clip_regeneration_requests r JOIN public.processing_jobs j ON j.id=r.job_id WHERE r.project_id=p_project_id AND r.clip_id=p_clip_id AND j.status IN ('queued','active')) THEN RETURN jsonb_build_object('outcome','CLIP_BUSY'); END IF;
  SELECT * INTO v_candidate FROM public.clip_candidates WHERE id = p_clip_id AND project_id = p_project_id
    AND processing_job_id = v_project.current_analysis_job_id AND kind = 'primary' AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('outcome', 'CLIP_NOT_FOUND'); END IF;
  SELECT video.duration_seconds INTO v_duration FROM public.transcripts AS transcript
    JOIN public.uploaded_videos AS video ON video.id = transcript.uploaded_video_id
    WHERE transcript.id = v_candidate.transcript_id AND video.deleted_at IS NULL;
  IF NOT FOUND THEN RETURN jsonb_build_object('outcome', 'CLIP_NOT_FOUND'); END IF;

  IF p_input IS NULL OR jsonb_typeof(p_input) <> 'object' OR NOT p_input ?& ARRAY[
      'expectedRevision', 'startTime', 'endTime', 'captionsEnabled', 'captionPosition', 'previewFontSize', 'captionEdits']
    OR EXISTS (SELECT 1 FROM jsonb_object_keys(p_input) AS key WHERE key <> ALL(ARRAY[
      'expectedRevision', 'startTime', 'endTime', 'captionsEnabled', 'captionPosition', 'previewFontSize', 'captionEdits', 'captionTextColor', 'framing']))
    OR jsonb_typeof(p_input->'expectedRevision') <> 'number'
    OR jsonb_typeof(p_input->'startTime') <> 'number' OR jsonb_typeof(p_input->'endTime') <> 'number'
    OR jsonb_typeof(p_input->'captionsEnabled') <> 'boolean'
    OR jsonb_typeof(p_input->'previewFontSize') <> 'number'
    OR jsonb_typeof(p_input->'captionPosition') <> 'object'
    OR jsonb_typeof(p_input->'captionEdits') <> 'array'
  THEN RETURN jsonb_build_object('outcome', 'CLIP_INVALID_CAPTION_METADATA'); END IF;
  IF (p_input->>'expectedRevision')::numeric <> v_candidate.edit_revision THEN
    RETURN jsonb_build_object('outcome', 'CLIP_EDIT_CONFLICT');
  END IF;
  v_start := (p_input->>'startTime')::numeric;
  v_end := (p_input->>'endTime')::numeric;
  IF v_start < 0 OR v_end <= v_start OR round(v_start, 3) >= round(v_end, 3) THEN
    RETURN jsonb_build_object('outcome', 'CLIP_INVALID_TIME_RANGE');
  END IF;
  IF v_end > v_duration THEN RETURN jsonb_build_object('outcome', 'CLIP_OUTSIDE_SOURCE_DURATION'); END IF;
  v_start := round(v_start, 3); v_end := round(v_end, 3);
  IF NOT (p_input->'captionPosition') ?& ARRAY['x', 'y']
    OR (SELECT count(*) FROM jsonb_object_keys(p_input->'captionPosition')) <> 2
    OR jsonb_typeof(p_input#>'{captionPosition,x}') <> 'number'
    OR jsonb_typeof(p_input#>'{captionPosition,y}') <> 'number'
    OR (p_input#>>'{captionPosition,x}')::numeric NOT BETWEEN 0 AND 1
    OR (p_input#>>'{captionPosition,y}')::numeric NOT BETWEEN 0 AND 1
    OR (p_input->>'previewFontSize')::numeric NOT BETWEEN 12 AND 96
    OR trunc((p_input->>'previewFontSize')::numeric) <> (p_input->>'previewFontSize')::numeric
  THEN RETURN jsonb_build_object('outcome', 'CLIP_INVALID_CAPTION_METADATA'); END IF;
  IF (p_input ? 'captionTextColor' AND (jsonb_typeof(p_input->'captionTextColor') <> 'string' OR p_input->>'captionTextColor' !~ '^#[0-9A-Fa-f]{6}$'))
    OR (p_input ? 'framing' AND NOT public.valid_clip_framing(p_input->'framing'))
  THEN RETURN jsonb_build_object('outcome', 'CLIP_INVALID_CAPTION_METADATA'); END IF;
  v_baseline := public.clip_editor_baseline(v_candidate);
  v_edits := p_input->'captionEdits';
  IF jsonb_array_length(v_edits) > 2000
    OR (SELECT count(DISTINCT edit->>'id') FROM jsonb_array_elements(v_edits) AS edit) <> jsonb_array_length(v_edits)
  THEN RETURN jsonb_build_object('outcome', 'CLIP_INVALID_CAPTION_METADATA'); END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_edits) AS edit WHERE jsonb_typeof(edit) <> 'object'
      OR NOT edit ?& ARRAY['id', 'text', 'highlights']
      OR jsonb_typeof(edit->'id') <> 'string' OR jsonb_typeof(edit->'text') <> 'string'
      OR length(btrim(edit->>'text')) NOT BETWEEN 1 AND 160
      OR jsonb_typeof(edit->'highlights') <> 'array'
      OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_baseline) AS line WHERE line->>'id' = edit->>'id')
  ) THEN RETURN jsonb_build_object('outcome', 'CLIP_INVALID_CAPTION_METADATA'); END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_edits) AS edit WHERE jsonb_array_length(edit->'highlights') > 10
      OR EXISTS (SELECT 1 FROM jsonb_object_keys(edit) AS key WHERE key <> ALL(ARRAY['id','text','highlights','highlightColors']))
    OR (edit ? 'highlightColors' AND NOT public.valid_highlight_colors(edit->'highlightColors', edit->'highlights'))
      OR EXISTS (SELECT 1 FROM jsonb_array_elements(edit->'highlights') AS word
        WHERE jsonb_typeof(word) <> 'string' OR length(btrim(word#>>'{}')) NOT BETWEEN 1 AND 64)
  ) THEN RETURN jsonb_build_object('outcome', 'CLIP_INVALID_CAPTION_METADATA'); END IF;

  -- An older client omitting colors preserves still-present phrase colors.
  SELECT COALESCE(jsonb_agg(CASE WHEN edit ? 'highlightColors' THEN edit ELSE
    edit || jsonb_build_object('highlightColors', COALESCE((SELECT jsonb_object_agg(c.key,c.value)
      FROM jsonb_array_elements(v_candidate.caption_edits) old,
        LATERAL jsonb_each(COALESCE(old->'highlightColors','{}'::jsonb)) c
      WHERE old->>'id'=edit->>'id' AND EXISTS (SELECT 1 FROM jsonb_array_elements_text(edit->'highlights') h WHERE lower(h)=c.key)), '{}'::jsonb)) END), '[]'::jsonb)
    INTO v_edits FROM jsonb_array_elements(v_edits) edit;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', line->>'id',
    'startTime', GREATEST((line->>'startTime')::numeric, v_start),
    'endTime', LEAST((line->>'endTime')::numeric, v_end),
    'text', COALESCE(edit->>'text', line->>'text'), 'highlights', COALESCE(edit->'highlights', '[]'::jsonb), 'highlightColors', COALESCE(edit->'highlightColors','{}'::jsonb))
    ORDER BY (line->>'startTime')::numeric, line->>'id'), '[]'::jsonb)
  INTO v_lines FROM jsonb_array_elements(v_baseline) AS line
  LEFT JOIN jsonb_array_elements(v_edits) AS edit ON edit->>'id' = line->>'id'
  WHERE (line->>'endTime')::numeric > v_start AND (line->>'startTime')::numeric < v_end;
  UPDATE public.clip_candidates SET start_time = v_start, end_time = v_end,
    captions_enabled = (p_input->>'captionsEnabled')::boolean,
    caption_position = p_input->'captionPosition', preview_font_size = (p_input->>'previewFontSize')::integer,
    caption_text_color = COALESCE(p_input->>'captionTextColor', caption_text_color),
    framing = CASE WHEN p_input ? 'framing' THEN p_input->'framing' ELSE framing END,
    caption_baseline = v_baseline, caption_edits = v_edits, caption_lines = v_lines,
    edit_revision = edit_revision + 1, updated_at = clock_timestamp()
    WHERE id = p_clip_id RETURNING * INTO v_candidate;
  RETURN jsonb_build_object('outcome', 'saved', 'editor', public.clip_editor_json(v_candidate, v_duration));
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
  RETURN jsonb_build_object('outcome', 'CLIP_INVALID_CAPTION_METADATA');
END;
$$;




--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.list_owned_project_clip_candidates(p_user_id text, p_project_id uuid)
RETURNS TABLE(project_id uuid, source_duration_seconds numeric, clips jsonb)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO pg_catalog, public, pg_temp
AS $$
  SELECT
    project.id,
    video.duration_seconds,
    COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'captionLines', candidate.caption_lines,
          'captionPosition', candidate.caption_position,
          'captionStyle', candidate.caption_style,
          'captionsEnabled', candidate.captions_enabled,
          'captionTextColor', candidate.caption_text_color, 'framing', candidate.framing, 'crop', candidate.crop,
          'endTime', candidate.end_time,
          'id', candidate.id,
          'revision', candidate.edit_revision, 'selected', candidate.selected, 'regenerationJobId', (SELECT r.job_id FROM public.clip_regeneration_requests r JOIN public.processing_jobs j ON j.id=r.job_id WHERE r.clip_id=candidate.id AND j.status IN ('queued','active') LIMIT 1),
          'previewFontSize', candidate.preview_font_size,
          'rank', candidate.rank,
          'score', candidate.score,
          'startTime', candidate.start_time,
          'title', candidate.title
        )
        ORDER BY candidate.rank, candidate.id
      )
      FROM (
        SELECT candidate_record.*
        FROM public.clip_candidates AS candidate_record
        WHERE candidate_record.project_id = project.id
          AND candidate_record.processing_job_id = project.current_analysis_job_id
          AND candidate_record.kind = 'primary'
          AND candidate_record.deleted_at IS NULL
        ORDER BY candidate_record.rank, candidate_record.id
        LIMIT 10
      ) AS candidate
    ), '[]'::jsonb)
  FROM public.projects AS project
  JOIN LATERAL (
    SELECT video_record.duration_seconds
    FROM public.uploaded_videos AS video_record
    WHERE video_record.project_id = project.id
      AND video_record.deleted_at IS NULL
    ORDER BY video_record.created_at DESC, video_record.id DESC
    LIMIT 1
  ) AS video ON true
  WHERE project.id = p_project_id
    AND project.user_id = p_user_id
    AND project.deleted_at IS NULL;
$$;


--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.clip_editor_json(c public.clip_candidates,d numeric) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO pg_catalog,public,pg_temp AS $$
 SELECT public.clip_editor_json_v6(c,d) || jsonb_build_object('clip',(public.clip_editor_json_v6(c,d)->'clip') || jsonb_build_object('selected',c.selected,'regenerationJobId',(SELECT r.job_id FROM public.clip_regeneration_requests r JOIN public.processing_jobs j ON j.id=r.job_id WHERE r.clip_id=c.id AND j.status IN ('queued','active') LIMIT 1)));
$$;

--> statement-breakpoint
CREATE FUNCTION public.claim_regeneration_dispatch(p_token uuid) RETURNS TABLE(job_id uuid,project_id uuid,job_status text,attempt_count integer,lease_expired boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog, public, pg_temp AS $$
DECLARE d uuid;
BEGIN
  SELECT x.id INTO d FROM public.processing_job_dispatches x JOIN public.processing_jobs j ON j.id=x.processing_job_id JOIN public.projects p ON p.current_job_id=j.id
  WHERE j.type='regenerate_clip_candidate' AND j.status IN ('queued','active') AND p.deleted_at IS NULL AND x.next_attempt_at<=clock_timestamp() AND (x.lease_token IS NULL OR x.lease_expires_at<=clock_timestamp())
  ORDER BY x.next_attempt_at FOR UPDATE OF x SKIP LOCKED LIMIT 1;
  IF d IS NULL THEN RETURN; END IF;
  UPDATE public.processing_job_dispatches SET lease_token=p_token,lease_owner='regeneration-dispatcher',lease_expires_at=clock_timestamp()+interval '30 seconds',attempt_count=processing_job_dispatches.attempt_count+1 WHERE id=d;
  RETURN QUERY SELECT j.id,j.project_id,j.status::text,j.attempt_count,COALESCE(j.execution_lease_expires_at<clock_timestamp(),true) FROM public.processing_jobs j JOIN public.processing_job_dispatches x ON x.processing_job_id=j.id WHERE x.id=d;
END $$;--> statement-breakpoint
CREATE FUNCTION public.finish_regeneration_dispatch(p_job uuid,p_token uuid,p_published boolean) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog, public, pg_temp AS $$
BEGIN
  UPDATE public.processing_job_dispatches SET status=CASE WHEN p_published THEN 'published'::public.processing_dispatch_status ELSE status END,
    published_at=CASE WHEN p_published THEN COALESCE(published_at,now()) ELSE published_at END,bullmq_job_id=CASE WHEN p_published THEN p_job::text ELSE bullmq_job_id END,
    next_attempt_at=clock_timestamp()+CASE WHEN p_published THEN interval '15 seconds' ELSE interval '3 seconds' END,lease_token=NULL,lease_owner=NULL,lease_expires_at=NULL
  WHERE processing_job_id=p_job AND lease_token=p_token;
  IF NOT FOUND THEN RETURN false; END IF;
  IF p_published THEN UPDATE public.processing_jobs SET bullmq_job_id=p_job::text WHERE id=p_job AND type='regenerate_clip_candidate'; END IF;
  RETURN true;
END $$;--> statement-breakpoint



--> statement-breakpoint
ALTER FUNCTION public.claim_regeneration_dispatch(uuid) OWNER TO repurposepro_owner;

--> statement-breakpoint
REVOKE ALL ON FUNCTION public.claim_regeneration_dispatch(uuid) FROM PUBLIC,repurposepro_runtime,repurposepro_processing,repurposepro_checkout,repurposepro_webhook;

--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.claim_regeneration_dispatch(uuid) TO repurposepro_processing;

--> statement-breakpoint
ALTER FUNCTION public.finish_regeneration_dispatch(uuid,uuid,boolean) OWNER TO repurposepro_owner;

--> statement-breakpoint
REVOKE ALL ON FUNCTION public.finish_regeneration_dispatch(uuid,uuid,boolean) FROM PUBLIC,repurposepro_runtime,repurposepro_processing,repurposepro_checkout,repurposepro_webhook;

--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.finish_regeneration_dispatch(uuid,uuid,boolean) TO repurposepro_processing;

--> statement-breakpoint
CREATE FUNCTION public.get_owned_job_status(p_user text,p_job uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO pg_catalog,public,pg_temp AS $$
 SELECT jsonb_build_object('id',j.id,'status',j.status,'step',j.step,'progress',COALESCE(j.progress,0),'message',j.error_message,'startedAt',j.started_at,'completedAt',j.completed_at)
 || CASE WHEN r.replacement_clip_id IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('replacementClipId',r.replacement_clip_id) END
 FROM public.processing_jobs j JOIN public.projects p ON p.id=j.project_id LEFT JOIN public.clip_regeneration_requests r ON r.job_id=j.id
 WHERE j.id=p_job AND j.user_id=p_user AND p.user_id=p_user AND p.deleted_at IS NULL;
$$;
--> statement-breakpoint
ALTER FUNCTION public.get_owned_job_status(text,uuid) OWNER TO repurposepro_owner;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.get_owned_job_status(text,uuid) FROM PUBLIC,repurposepro_runtime,repurposepro_processing,repurposepro_checkout,repurposepro_webhook;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.get_owned_job_status(text,uuid) TO repurposepro_runtime;
