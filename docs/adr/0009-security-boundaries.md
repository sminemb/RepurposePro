# ADR 0009 — Security boundaries and fail-closed mutations

Date: 2026-10-03. Status: Accepted for VS11.

## Context

Authentication, uploads and paid or queued work need protection before side effects. Storage,
queue deliveries and provider output are additional trust boundaries. Retries must retain the
existing financial and retention guarantees from ADRs 0007 and 0008.

## Decision

Use Arcjet Shield, bot detection and independent action windows for interactive mutations.
Better Auth's actual signup/login POST routes use the Next.js adapter. API actions use the Node
adapter after session validation and before handlers or multipart staging. Production requires
LIVE. Local DRY_RUN records simulated denials; protection errors still reject with 503.
Only configured API socket peers may supply forwarded client addresses. Web production ingress
supports Vercel's overwritten platform IP header; unsupported ingress fails closed. Signed
Stripe webhooks bypass interactive protection and retain signature verification and durable,
purchase-correlated atomic grants.

Keep resource authorization in restricted database functions with owner and parent predicates.
Upload ownership and eligibility are checked before staging and again before promotion. Bound
multipart input, retain actual media validation, and reject storage escapes and links/junctions
through resolved ancestor checks. Recursive removals validate descendants first. Retention
registration and writer leases precede staging writes; interrupted work remains discoverable.

Validate exact queue contracts, names, IDs and applicable delivery-ID agreement before database
or external work. Resolve sources and paths from durable state. Subprocesses use approved media
or Python executable names, server-authored arguments, no shell, bounded output, timeouts and
cancellation. Operator-controlled scripts/models are not queue inputs. Storage is private to the
application account; containment checks do not replace operating-system write permissions.

Treat Gemini transcripts as data and validate strict bounded selections before persistence.
Application cancellation/timeouts also bound a stalled SDK. Reserve each paid selection call
durably before external work, with three total calls across delivery retries. Cached transcripts,
valid partial clip fallback, eligible exactly-once refunds and seven-day deadlines remain intact.

Serialize logs through shared allowlists. Request IDs are bounded to 64 safe characters; raw
request URLs, bodies, headers, cookies, errors, provider content and storage paths are omitted.
Protection outcomes and stage IDs remain observable. Expected HTTP errors preserve their status;
existing domain envelopes remain unchanged. Protection failures give actionable retry guidance.

## Consequences and verification

Provider outages prevent new protected work before effects. Database and queue correctness do
not depend on Arcjet availability. No new schema migration was necessary; existing forward
retention migrations 0044–0046 still precede service startup. Local verified outcomes and the
separate live Arcjet smoke are recorded in [VS11 evidence](../verification/vs11.md). Deployment
must verify the real ingress IP replacement and LIVE enforcement; no deployment is part of VS11.
