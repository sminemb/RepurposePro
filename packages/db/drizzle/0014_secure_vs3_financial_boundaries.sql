DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'repurposepro_checkout') THEN
    RAISE EXCEPTION 'repurposepro_checkout must be provisioned before migration';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'repurposepro_webhook') THEN
    RAISE EXCEPTION 'repurposepro_webhook must be provisioned before migration';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'repurposepro_processing') THEN
    RAISE EXCEPTION 'repurposepro_processing must be provisioned before migration';
  END IF;
END;
$$;--> statement-breakpoint

CREATE TYPE public.stripe_checkout_session_status AS ENUM (
  'creating',
  'open',
  'completed',
  'failed',
  'expired'
);--> statement-breakpoint

CREATE TABLE public.stripe_checkout_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL REFERENCES public.users(id),
  pack_code text NOT NULL,
  stripe_price_id text NOT NULL,
  stripe_session_id text,
  amount_cents integer NOT NULL,
  currency text NOT NULL,
  credits integer NOT NULL,
  livemode boolean NOT NULL,
  status public.stripe_checkout_session_status NOT NULL DEFAULT 'creating',
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT stripe_checkout_sessions_pack_code_check
    CHECK (pack_code IN ('starter', 'creator', 'pro')),
  CONSTRAINT stripe_checkout_sessions_price_id_check CHECK (stripe_price_id <> ''),
  CONSTRAINT stripe_checkout_sessions_amount_cents_check CHECK (amount_cents > 0),
  CONSTRAINT stripe_checkout_sessions_credits_check CHECK (credits > 0),
  CONSTRAINT stripe_checkout_sessions_binding_check CHECK (
    (status IN ('creating', 'failed') AND stripe_session_id IS NULL)
    OR (
      status IN ('open', 'completed', 'expired')
      AND stripe_session_id IS NOT NULL
      AND expires_at IS NOT NULL
    )
  )
);--> statement-breakpoint

CREATE UNIQUE INDEX stripe_checkout_sessions_stripe_session_id_unique
  ON public.stripe_checkout_sessions (stripe_session_id)
  WHERE stripe_session_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX stripe_checkout_sessions_user_created_at_idx
  ON public.stripe_checkout_sessions (user_id, created_at);--> statement-breakpoint

CREATE FUNCTION public.create_stripe_checkout_attempt(
  p_user_id text,
  p_pack_code text,
  p_stripe_price_id text,
  p_livemode boolean
)
RETURNS TABLE (
  attempt_id uuid,
  idempotency_key text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog, public, pg_temp
AS $$
DECLARE
  v_attempt_id uuid;
  v_amount_cents integer;
  v_credits integer;
BEGIN
  IF p_user_id IS NULL
    OR p_user_id = ''
    OR p_stripe_price_id IS NULL
    OR p_stripe_price_id = ''
    OR p_livemode IS NULL THEN
    RAISE EXCEPTION 'Stripe checkout attempt identity is required' USING ERRCODE = '23514';
  END IF;

  SELECT terms.amount_cents, terms.credits
  INTO v_amount_cents, v_credits
  FROM (
    VALUES
      ('starter'::text, 1000::integer, 40::integer),
      ('creator'::text, 2500::integer, 100::integer),
      ('pro'::text, 5000::integer, 200::integer)
  ) AS terms(pack_code, amount_cents, credits)
  WHERE terms.pack_code = p_pack_code;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unknown Stripe credit pack' USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.stripe_checkout_sessions (
    user_id,
    pack_code,
    stripe_price_id,
    amount_cents,
    currency,
    credits,
    livemode
  )
  VALUES (
    p_user_id,
    p_pack_code,
    p_stripe_price_id,
    v_amount_cents,
    'usd',
    v_credits,
    p_livemode
  )
  RETURNING id INTO v_attempt_id;

  RETURN QUERY SELECT v_attempt_id, 'stripe-checkout:' || v_attempt_id::text;
END;
$$;--> statement-breakpoint

CREATE FUNCTION public.attach_stripe_checkout_session(
  p_attempt_id uuid,
  p_stripe_session_id text,
  p_expires_at timestamptz
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog, public, pg_temp
AS $$
BEGIN
  IF p_attempt_id IS NULL
    OR p_stripe_session_id IS NULL
    OR p_stripe_session_id = ''
    OR p_expires_at IS NULL THEN
    RAISE EXCEPTION 'Stripe checkout session binding is required' USING ERRCODE = '23514';
  END IF;

  UPDATE public.stripe_checkout_sessions
  SET stripe_session_id = p_stripe_session_id,
      expires_at = p_expires_at,
      status = 'open',
      updated_at = now()
  WHERE id = p_attempt_id
    AND status = 'creating'
    AND stripe_session_id IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Stripe checkout attempt is not attachable' USING ERRCODE = '23514';
  END IF;

  RETURN 'attached';
END;
$$;--> statement-breakpoint

CREATE FUNCTION public.fail_stripe_checkout_attempt(p_attempt_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog, public, pg_temp
AS $$
BEGIN
  UPDATE public.stripe_checkout_sessions
  SET status = 'failed', updated_at = now()
  WHERE id = p_attempt_id
    AND status = 'creating'
    AND stripe_session_id IS NULL;

  IF NOT FOUND THEN
    RETURN 'unchanged';
  END IF;

  RETURN 'failed';
END;
$$;--> statement-breakpoint

DROP FUNCTION public.grant_stripe_credit_purchase(
  text,
  text,
  text,
  text,
  text,
  text,
  integer,
  text,
  integer
);--> statement-breakpoint

CREATE FUNCTION public.grant_stripe_credit_purchase(
  p_stripe_event_id text,
  p_event_type text,
  p_user_id text,
  p_checkout_session_id text,
  p_payment_intent_id text,
  p_price_id text,
  p_quantity integer,
  p_amount_cents integer,
  p_currency text,
  p_livemode boolean,
  p_mode text,
  p_payment_status text,
  p_session_status text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog, public, pg_temp
AS $$
DECLARE
  v_attempt public.stripe_checkout_sessions%ROWTYPE;
  v_event_record_id uuid;
  v_existing_payment public.stripe_payments%ROWTYPE;
  v_payment_id uuid;
BEGIN
  IF p_stripe_event_id IS NULL
    OR p_stripe_event_id = ''
    OR p_event_type <> 'checkout.session.completed'
    OR p_user_id IS NULL
    OR p_user_id = ''
    OR p_checkout_session_id IS NULL
    OR p_checkout_session_id = ''
    OR p_price_id IS NULL
    OR p_price_id = ''
    OR p_quantity <> 1
    OR p_mode <> 'payment'
    OR p_payment_status <> 'paid'
    OR p_session_status <> 'complete'
    OR p_livemode IS NULL THEN
    RAISE EXCEPTION 'invalid Stripe checkout purchase identity' USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.stripe_webhook_events (stripe_event_id, event_type)
  VALUES (p_stripe_event_id, p_event_type)
  ON CONFLICT (stripe_event_id) DO NOTHING
  RETURNING id INTO v_event_record_id;

  IF NOT FOUND THEN
    RETURN 'duplicate_event';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('stripe-checkout:' || p_checkout_session_id));

  SELECT *
  INTO v_attempt
  FROM public.stripe_checkout_sessions
  WHERE stripe_session_id = p_checkout_session_id
  FOR UPDATE;

  IF NOT FOUND
    OR v_attempt.user_id IS DISTINCT FROM p_user_id
    OR v_attempt.stripe_price_id IS DISTINCT FROM p_price_id
    OR v_attempt.amount_cents IS DISTINCT FROM p_amount_cents
    OR v_attempt.currency IS DISTINCT FROM p_currency
    OR v_attempt.livemode IS DISTINCT FROM p_livemode THEN
    RAISE EXCEPTION 'Stripe purchase does not match a server-created Checkout session'
      USING ERRCODE = '23514';
  END IF;

  IF v_attempt.status = 'completed' THEN
    SELECT *
    INTO v_existing_payment
    FROM public.stripe_payments
    WHERE stripe_checkout_session_id = p_checkout_session_id
    FOR UPDATE;

    IF NOT FOUND
      OR v_existing_payment.user_id IS DISTINCT FROM v_attempt.user_id
      OR v_existing_payment.pack_code IS DISTINCT FROM v_attempt.pack_code
      OR v_existing_payment.amount_cents IS DISTINCT FROM v_attempt.amount_cents
      OR v_existing_payment.currency IS DISTINCT FROM v_attempt.currency
      OR v_existing_payment.credits_granted IS DISTINCT FROM v_attempt.credits
      OR v_existing_payment.status IS DISTINCT FROM 'paid' THEN
      RAISE EXCEPTION 'conflicting Stripe payment replay' USING ERRCODE = '23514';
    END IF;

    UPDATE public.stripe_webhook_events
    SET processed_at = now(), status = 'ignored'
    WHERE id = v_event_record_id;

    RETURN 'already_granted';
  END IF;

  IF v_attempt.status <> 'open' THEN
    RAISE EXCEPTION 'Stripe checkout session is not open for fulfillment'
      USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.stripe_payments (
    user_id,
    stripe_checkout_session_id,
    stripe_payment_intent_id,
    stripe_event_id,
    pack_code,
    amount_cents,
    currency,
    credits_granted,
    status
  )
  VALUES (
    v_attempt.user_id,
    p_checkout_session_id,
    NULLIF(p_payment_intent_id, ''),
    p_stripe_event_id,
    v_attempt.pack_code,
    v_attempt.amount_cents,
    v_attempt.currency,
    v_attempt.credits,
    'paid'
  )
  RETURNING id INTO v_payment_id;

  INSERT INTO public.credit_ledger (
    user_id,
    type,
    amount,
    stripe_payment_id,
    description,
    idempotency_key
  )
  VALUES (
    v_attempt.user_id,
    'purchase',
    v_attempt.credits,
    v_payment_id,
    'Purchased credit pack: ' || v_attempt.pack_code,
    'stripe-checkout:' || v_attempt.id::text
  );

  UPDATE public.stripe_checkout_sessions
  SET status = 'completed', updated_at = now()
  WHERE id = v_attempt.id;

  UPDATE public.stripe_webhook_events
  SET processed_at = now(), status = 'processed'
  WHERE id = v_event_record_id;

  RETURN 'granted';
END;
$$;--> statement-breakpoint

CREATE FUNCTION public.expire_stripe_checkout_session(
  p_stripe_event_id text,
  p_event_type text,
  p_checkout_session_id text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog, public, pg_temp
AS $$
DECLARE
  v_event_record_id uuid;
  v_expired boolean;
BEGIN
  IF p_stripe_event_id IS NULL
    OR p_stripe_event_id = ''
    OR p_event_type <> 'checkout.session.expired'
    OR p_checkout_session_id IS NULL
    OR p_checkout_session_id = '' THEN
    RAISE EXCEPTION 'invalid Stripe checkout expiration identity' USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.stripe_webhook_events (stripe_event_id, event_type)
  VALUES (p_stripe_event_id, p_event_type)
  ON CONFLICT (stripe_event_id) DO NOTHING
  RETURNING id INTO v_event_record_id;

  IF NOT FOUND THEN
    RETURN 'duplicate_event';
  END IF;

  UPDATE public.stripe_checkout_sessions
  SET status = 'expired', updated_at = now()
  WHERE stripe_session_id = p_checkout_session_id
    AND status = 'open';

  v_expired := FOUND;

  UPDATE public.stripe_webhook_events
  SET processed_at = now(), status = CASE WHEN v_expired THEN 'processed' ELSE 'ignored' END
  WHERE id = v_event_record_id;

  RETURN 'expired';
END;
$$;--> statement-breakpoint

CREATE FUNCTION public.mark_paid_analysis_enqueued(
  p_user_id text,
  p_project_id uuid,
  p_job_id uuid,
  p_bullmq_job_id text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog, public, pg_temp
AS $$
BEGIN
  IF p_user_id IS NULL
    OR p_user_id = ''
    OR p_project_id IS NULL
    OR p_job_id IS NULL
    OR p_bullmq_job_id IS NULL
    OR p_bullmq_job_id = '' THEN
    RAISE EXCEPTION 'processing queue reference identity is required' USING ERRCODE = '23514';
  END IF;

  UPDATE public.processing_jobs AS processing_job
  SET bullmq_job_id = p_bullmq_job_id,
      updated_at = now()
  FROM public.projects AS project
  WHERE processing_job.id = p_job_id
    AND processing_job.project_id = project.id
    AND project.id = p_project_id
    AND project.user_id = p_user_id
    AND processing_job.type = 'analyze_video'
    AND (
      processing_job.bullmq_job_id IS NULL
      OR processing_job.bullmq_job_id = p_bullmq_job_id
    );

  IF NOT FOUND THEN
    RAISE EXCEPTION 'processing queue reference did not update one job'
      USING ERRCODE = '23514';
  END IF;

  RETURN 'marked';
END;
$$;--> statement-breakpoint

ALTER FUNCTION public.create_stripe_checkout_attempt(text, text, text, boolean)
  OWNER TO repurposepro_owner;--> statement-breakpoint
ALTER FUNCTION public.attach_stripe_checkout_session(uuid, text, timestamptz)
  OWNER TO repurposepro_owner;--> statement-breakpoint
ALTER FUNCTION public.fail_stripe_checkout_attempt(uuid)
  OWNER TO repurposepro_owner;--> statement-breakpoint
ALTER FUNCTION public.grant_stripe_credit_purchase(
  text,
  text,
  text,
  text,
  text,
  text,
  integer,
  integer,
  text,
  boolean,
  text,
  text,
  text
) OWNER TO repurposepro_owner;--> statement-breakpoint
ALTER FUNCTION public.expire_stripe_checkout_session(text, text, text)
  OWNER TO repurposepro_owner;--> statement-breakpoint
ALTER FUNCTION public.mark_paid_analysis_enqueued(text, uuid, uuid, text)
  OWNER TO repurposepro_owner;--> statement-breakpoint

REVOKE ALL ON TABLE public.stripe_checkout_sessions
  FROM PUBLIC, repurposepro_runtime, repurposepro_checkout, repurposepro_webhook, repurposepro_processing;--> statement-breakpoint
REVOKE ALL ON TABLE public.stripe_customers, public.stripe_payments, public.stripe_webhook_events
  FROM repurposepro_runtime;--> statement-breakpoint
REVOKE INSERT ON TABLE public.processing_jobs FROM repurposepro_runtime;--> statement-breakpoint
REVOKE UPDATE ON TABLE public.processing_jobs FROM repurposepro_runtime;--> statement-breakpoint
GRANT UPDATE (
  status,
  step,
  progress,
  attempt_count,
  error_code,
  error_message,
  started_at,
  completed_at,
  updated_at
) ON TABLE public.processing_jobs TO repurposepro_runtime;--> statement-breakpoint

GRANT USAGE ON SCHEMA public
  TO repurposepro_checkout, repurposepro_webhook, repurposepro_processing;--> statement-breakpoint
REVOKE CREATE ON SCHEMA public
  FROM repurposepro_checkout, repurposepro_webhook, repurposepro_processing;--> statement-breakpoint

REVOKE ALL ON FUNCTION public.create_stripe_checkout_attempt(text, text, text, boolean)
  FROM PUBLIC, repurposepro_runtime, repurposepro_webhook, repurposepro_processing;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.attach_stripe_checkout_session(uuid, text, timestamptz)
  FROM PUBLIC, repurposepro_runtime, repurposepro_webhook, repurposepro_processing;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.fail_stripe_checkout_attempt(uuid)
  FROM PUBLIC, repurposepro_runtime, repurposepro_webhook, repurposepro_processing;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.record_stripe_webhook_ignored(text, text)
  FROM PUBLIC, repurposepro_runtime, repurposepro_checkout, repurposepro_processing;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.grant_stripe_credit_purchase(
  text,
  text,
  text,
  text,
  text,
  text,
  integer,
  integer,
  text,
  boolean,
  text,
  text,
  text
) FROM PUBLIC, repurposepro_runtime, repurposepro_checkout, repurposepro_processing;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.expire_stripe_checkout_session(text, text, text)
  FROM PUBLIC, repurposepro_runtime, repurposepro_checkout, repurposepro_processing;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.start_paid_video_analysis(text, uuid)
  FROM PUBLIC, repurposepro_runtime, repurposepro_checkout, repurposepro_webhook;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.mark_paid_analysis_enqueued(text, uuid, uuid, text)
  FROM PUBLIC, repurposepro_runtime, repurposepro_checkout, repurposepro_webhook;--> statement-breakpoint

GRANT EXECUTE ON FUNCTION public.create_stripe_checkout_attempt(text, text, text, boolean)
  TO repurposepro_checkout;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.attach_stripe_checkout_session(uuid, text, timestamptz)
  TO repurposepro_checkout;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.fail_stripe_checkout_attempt(uuid)
  TO repurposepro_checkout;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.record_stripe_webhook_ignored(text, text)
  TO repurposepro_webhook;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.grant_stripe_credit_purchase(
  text,
  text,
  text,
  text,
  text,
  text,
  integer,
  integer,
  text,
  boolean,
  text,
  text,
  text
) TO repurposepro_webhook;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.expire_stripe_checkout_session(text, text, text)
  TO repurposepro_webhook;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.start_paid_video_analysis(text, uuid)
  TO repurposepro_processing;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.mark_paid_analysis_enqueued(text, uuid, uuid, text)
  TO repurposepro_processing;--> statement-breakpoint

ALTER DEFAULT PRIVILEGES FOR ROLE repurposepro_owner IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;--> statement-breakpoint
ALTER DEFAULT PRIVILEGES FOR ROLE repurposepro_owner IN SCHEMA public
  REVOKE ALL ON TABLES
  FROM PUBLIC, repurposepro_runtime, repurposepro_checkout, repurposepro_webhook, repurposepro_processing;--> statement-breakpoint

DO $$
BEGIN
  EXECUTE format(
    'REVOKE CREATE, TEMPORARY ON DATABASE %I FROM repurposepro_checkout, repurposepro_webhook, repurposepro_processing',
    current_database()
  );
END;
$$;
