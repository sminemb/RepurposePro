CREATE FUNCTION public.record_stripe_webhook_ignored(
  p_stripe_event_id text,
  p_event_type text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog, public, pg_temp
AS $$
DECLARE
  v_event_id uuid;
BEGIN
  IF p_stripe_event_id IS NULL OR p_stripe_event_id = '' OR p_event_type IS NULL OR p_event_type = '' THEN
    RAISE EXCEPTION 'Stripe webhook event identity is required' USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.stripe_webhook_events (stripe_event_id, event_type)
  VALUES (p_stripe_event_id, p_event_type)
  ON CONFLICT (stripe_event_id) DO NOTHING
  RETURNING id INTO v_event_id;

  IF NOT FOUND THEN
    RETURN 'duplicate_event';
  END IF;

  UPDATE public.stripe_webhook_events
  SET processed_at = now(), status = 'ignored'
  WHERE id = v_event_id;

  RETURN 'ignored';
END;
$$;--> statement-breakpoint

CREATE FUNCTION public.grant_stripe_credit_purchase(
  p_stripe_event_id text,
  p_event_type text,
  p_user_id text,
  p_checkout_session_id text,
  p_payment_intent_id text,
  p_pack_code text,
  p_amount_cents integer,
  p_currency text,
  p_credits integer
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog, public, pg_temp
AS $$
DECLARE
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
    OR p_payment_intent_id = '' THEN
    RAISE EXCEPTION 'invalid Stripe checkout purchase identity' USING ERRCODE = '23514';
  END IF;

  IF NOT (
    (p_pack_code = 'starter' AND p_amount_cents = 1000 AND p_currency = 'usd' AND p_credits = 40)
    OR (p_pack_code = 'creator' AND p_amount_cents = 2500 AND p_currency = 'usd' AND p_credits = 100)
    OR (p_pack_code = 'pro' AND p_amount_cents = 5000 AND p_currency = 'usd' AND p_credits = 200)
  ) THEN
    RAISE EXCEPTION 'Stripe purchase terms do not match an approved credit pack' USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.stripe_webhook_events (stripe_event_id, event_type)
  VALUES (p_stripe_event_id, p_event_type)
  ON CONFLICT (stripe_event_id) DO NOTHING
  RETURNING id INTO v_event_record_id;

  IF NOT FOUND THEN
    RETURN 'duplicate_event';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('stripe-checkout:' || p_checkout_session_id));

  IF p_payment_intent_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext('stripe-payment-intent:' || p_payment_intent_id));
  END IF;

  SELECT *
  INTO v_existing_payment
  FROM public.stripe_payments
  WHERE stripe_checkout_session_id = p_checkout_session_id
    OR (
      p_payment_intent_id IS NOT NULL
      AND stripe_payment_intent_id = p_payment_intent_id
    )
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing_payment.user_id IS DISTINCT FROM p_user_id
      OR v_existing_payment.pack_code IS DISTINCT FROM p_pack_code
      OR v_existing_payment.amount_cents IS DISTINCT FROM p_amount_cents
      OR v_existing_payment.currency IS DISTINCT FROM p_currency
      OR v_existing_payment.credits_granted IS DISTINCT FROM p_credits
      OR v_existing_payment.status IS DISTINCT FROM 'paid' THEN
      RAISE EXCEPTION 'conflicting Stripe payment replay' USING ERRCODE = '23514';
    END IF;

    UPDATE public.stripe_webhook_events
    SET processed_at = now(), status = 'ignored'
    WHERE id = v_event_record_id;

    RETURN 'already_granted';
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
    p_user_id,
    p_checkout_session_id,
    p_payment_intent_id,
    p_stripe_event_id,
    p_pack_code,
    p_amount_cents,
    p_currency,
    p_credits,
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
    p_user_id,
    'purchase',
    p_credits,
    v_payment_id,
    'Purchased credit pack: ' || p_pack_code,
    'stripe-purchase:' || p_stripe_event_id
  );

  UPDATE public.stripe_webhook_events
  SET processed_at = now(), status = 'processed'
  WHERE id = v_event_record_id;

  RETURN 'granted';
END;
$$;--> statement-breakpoint

ALTER FUNCTION public.record_stripe_webhook_ignored(text, text) OWNER TO repurposepro_owner;--> statement-breakpoint
ALTER FUNCTION public.grant_stripe_credit_purchase(text, text, text, text, text, text, integer, text, integer) OWNER TO repurposepro_owner;--> statement-breakpoint

REVOKE ALL ON FUNCTION public.record_stripe_webhook_ignored(text, text) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.grant_stripe_credit_purchase(text, text, text, text, text, text, integer, text, integer) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.record_stripe_webhook_ignored(text, text) TO repurposepro_runtime;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.grant_stripe_credit_purchase(text, text, text, text, text, text, integer, text, integer) TO repurposepro_runtime;
