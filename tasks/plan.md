# VS3-R2 Reliability Plan

## Goal

Close the six remaining VS3 reliability defects without changing applied
migrations `0014` or `0015`.

## Scope

1. Give BullMQ producers and blocking consumers separately owned Redis
   connections with reconnect, fast-failure, and idempotent shutdown behavior.
2. Preserve the first terminal processing failure reason and surface conflicting
   later reasons.
3. Persist terminal queue failure intents in PostgreSQL and drain them through a
   leased, restart-safe sweeper.
4. Reconcile published analysis jobs against Redis, restore missing queued jobs,
   and expire only stale active execution leases.
5. Add a global safe API error envelope for unexpected exceptions while
   preserving valid application envelopes.
6. Persist verified Stripe event receipts before financial processing and make
   retry/concurrency behavior durable and exactly-once.

## Constraints

- Add forward-only migrations; never edit `0014` or `0015`.
- Keep PostgreSQL as durable truth and BullMQ payloads ID-only.
- Add failing regression tests before implementation.
- Do not expand into VS4 worker analysis behavior or VS9 refund UI.
- Run changed-file Prettier, focused/full tests as appropriate, typecheck, lint,
  integration tests, and `git diff --check`.
- Update all required project records and commit the verified task.

## Acceptance

- Redis outage/recovery works in one API process without an offline command
  backlog.
- Terminal failure reason is immutable under retries and concurrency.
- Queue failure events survive restart, duplicate delivery, marker failures, and
  event loss.
- Queued jobs missing from Redis are restored deterministically; active jobs are
  only failed after a durable lease expires.
- Unexpected API errors use the standard safe envelope and safe logging.
- Signature-verified Stripe receipts survive downstream failure and replay grants
  credits exactly once.
