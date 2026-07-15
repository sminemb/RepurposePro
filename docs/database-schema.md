# RepurposePro Database Schema

## 1. Purpose

This document defines the recommended PostgreSQL data model for **RepurposePro**.

It is the schema reference for:

- Drizzle ORM models
- Migrations
- API implementation
- Workers
- Billing invariants
- Retention logic
- Coding agents
- Tests

Core database principles:

```text
PostgreSQL is the durable source of truth.
Redis is not the source of truth.
Credits use an immutable ledger.
Heavy jobs are persisted before queueing.
Ownership is explicit.
Retries must not duplicate financial or output records.
```

---

## 2. Naming Conventions

Use:

```text
snake_case for database columns
plural table names
UTC timestamps
opaque UUID-style IDs
```

Recommended timestamp columns:

```text
created_at
updated_at
deleted_at
expires_at
```

Use soft deletion only where useful.

Do not soft-delete immutable ledger history.

---

## 3. Core Tables

Recommended tables:

```text
users / Better Auth tables
projects
uploaded_videos
processing_jobs
transcripts
transcript_segments
clip_candidates
summary_segments
rendered_outputs
credit_ledger
stripe_customers
stripe_payments
stripe_webhook_events
```

Optional later:

```text
project_events
audit_logs
render_attempts
prompt_versions
```

---

# 4. Users

Better Auth may manage the core auth tables.

RepurposePro should not duplicate auth-owned fields unnecessarily.

Recommended app-level user reference:

```text
users
```

Fields depend on Better Auth schema.

Minimum application assumptions:

| Column | Type | Rules |
|---|---|---|
| `id` | uuid/text | Primary key |
| `name` | text | Nullable depending on auth |
| `email` | text | Unique |
| `created_at` | timestamptz | Required |

Ownership foreign keys should reference this user ID.

---

# 5. `projects`

Represents one user project.

| Column | Type | Rules |
|---|---|---|
| `id` | uuid | PK |
| `user_id` | uuid/text | FK users, required |
| `name` | varchar(120) | Required |
| `output_type` | enum | `clips` or `summary` |
| `status` | enum | Required |
| `current_job_id` | uuid nullable | FK processing_jobs; job must belong to this project |
| `created_at` | timestamptz | Required |
| `updated_at` | timestamptz | Required |
| `deleted_at` | timestamptz nullable | Optional soft delete |

Recommended status values:

```text
draft
uploaded
waiting_for_payment
queued
transcribing
analyzing
preview_ready
waiting_for_user_edits
rendering
completed
failed
refunded
deleted
```

Indexes:

```text
(user_id, created_at desc)
(user_id, status)
```

Rules:

- Every project belongs to exactly one user.
- Project status should reflect user-facing lifecycle.
- Do not derive ownership from child rows.

---

# 6. `uploaded_videos`

Stores source video metadata.

| Column | Type | Rules |
|---|---|---|
| `id` | uuid | PK |
| `project_id` | uuid | FK projects, unique for MVP |
| `original_file_name` | text | Required |
| `storage_path` | text | Internal only |
| `mime_type` | text | Required |
| `file_size_bytes` | bigint | Required |
| `duration_seconds` | numeric | Required |
| `width` | integer | Required |
| `height` | integer | Required |
| `fps` | numeric nullable | Optional |
| `video_codec` | text nullable | Optional |
| `audio_codec` | text nullable | Optional |
| `has_audio` | boolean | Required |
| `detected_language` | text nullable | Optional |
| `checksum` | text nullable | Recommended |
| `expires_at` | timestamptz | Required |
| `deleted_at` | timestamptz nullable | Optional |
| `created_at` | timestamptz | Required |
| `updated_at` | timestamptz | Required |

Constraints:

```text
duration_seconds > 0
file_size_bytes > 0
width > 0
height > 0
```

MVP business constraints:

```text
file_size_bytes <= 500 MB
duration_seconds <= 1800
has_audio = true
```

Indexes:

```text
(project_id)
(expires_at) where deleted_at is null
```

---

# 7. `processing_jobs`

Durable record of analysis, render, regeneration, and cleanup work.

| Column | Type | Rules |
|---|---|---|
| `id` | uuid | PK |
| `project_id` | uuid | FK projects |
| `user_id` | uuid/text | FK users |
| `type` | enum | Required |
| `status` | enum | Required |
| `step` | enum nullable | Current processing step |
| `progress` | integer nullable | 0–100 if meaningful |
| `credits_charged` | integer | Default 0 |
| `refund_eligible` | boolean | Default false |
| `refund_completed_at` | timestamptz nullable | For idempotency |
| `attempt_count` | integer | Default 0 |
| `bullmq_job_id` | text nullable | Queue reference |
| `error_code` | text nullable | Stable code |
| `error_message` | text nullable | Sanitized message |
| `started_at` | timestamptz nullable | |
| `completed_at` | timestamptz nullable | |
| `created_at` | timestamptz | Required |
| `updated_at` | timestamptz | Required |

Job types:

```text
analyze_video
render_clips
render_summary
regenerate_clip_candidate
cleanup_expired_project_files
```

Job statuses:

```text
queued
active
completed
failed
refunded
cancelled
```

Job steps:

```text
queued
preparing
extracting_audio
transcribing
analyzing
generating_preview
preview_ready
rendering
saving_output
completed
failed
```

Recommended indexes:

```text
(project_id, created_at desc)
(user_id, created_at desc)
(status, created_at)
```

Critical rule:

```text
Credit deduction happens before queueing and never inside the worker.
The (id, project_id, user_id) ownership tuple is immutable after job creation.
credits_charged is immutable and every deduction must equal its negative value.
Projects may point only to a job for the same project; deleting that job clears current_job_id.
```

---

# 8. `transcripts`

Stores one transcript per uploaded source video.

| Column | Type | Rules |
|---|---|---|
| `id` | uuid | PK |
| `project_id` | uuid | FK projects |
| `uploaded_video_id` | uuid | FK uploaded_videos |
| `language` | text | MVP expects `en` |
| `full_text` | text | Required |
| `model_name` | text | Whisper model used |
| `has_word_timestamps` | boolean | Required |
| `created_at` | timestamptz | Required |
| `updated_at` | timestamptz | Required |

Constraints:

```text
unique(uploaded_video_id)
```

---

# 9. `transcript_segments`

Timestamped transcript pieces.

| Column | Type | Rules |
|---|---|---|
| `id` | uuid | PK |
| `transcript_id` | uuid | FK transcripts |
| `segment_index` | integer | Required |
| `start_time` | numeric | Seconds |
| `end_time` | numeric | Seconds |
| `text` | text | Required |
| `confidence` | numeric nullable | Optional |
| `words_json` | jsonb nullable | Optional word timestamps |
| `created_at` | timestamptz | Required |

Constraints:

```text
end_time > start_time
segment_index >= 0
unique(transcript_id, segment_index)
```

Recommended index:

```text
(transcript_id, segment_index)
```

Example `words_json`:

```json
[
  {
    "word": "Most",
    "start": 0.12,
    "end": 0.42
  }
]
```

---

# 10. `clip_candidates`

Stores primary and backup clip candidates plus editable preview metadata.

| Column | Type | Rules |
|---|---|---|
| `id` | uuid | PK |
| `project_id` | uuid | FK projects |
| `source_job_id` | uuid | FK processing_jobs |
| `title` | text | Required |
| `start_time` | numeric | Seconds |
| `end_time` | numeric | Seconds |
| `score` | integer nullable | 0–100 |
| `reason` | text | Required |
| `transcript_excerpt` | text nullable | Optional |
| `is_backup` | boolean | Default false |
| `selected` | boolean | Default true for primary |
| `deleted` | boolean | Default false |
| `replacement_for_clip_id` | uuid nullable | Self FK |
| `caption_enabled` | boolean | Default true |
| `caption_style` | text | Default `hormozi` |
| `caption_font_size` | integer | Default from UI tokens |
| `caption_position_json` | jsonb | Required |
| `caption_lines_json` | jsonb | Required |
| `crop_metadata_json` | jsonb nullable | Face-aware crop metadata |
| `version` | integer | Optimistic locking, default 1 |
| `created_at` | timestamptz | Required |
| `updated_at` | timestamptz | Required |
| `deleted_at` | timestamptz nullable | Optional |

Constraints:

```text
end_time > start_time
score between 0 and 100 when not null
```

Recommended indexes:

```text
(project_id, is_backup, selected)
(project_id, created_at)
```

Example caption position:

```json
{
  "x": 0.5,
  "y": 0.72
}
```

Example caption lines:

```json
[
  {
    "start": 0,
    "end": 2.5,
    "text": "Most creators burn out because they lack systems.",
    "highlights": ["burn out", "systems"]
  }
]
```

Example crop metadata:

```json
{
  "strategy": "face_aware",
  "sourceWidth": 1920,
  "sourceHeight": 1080,
  "targetAspectRatio": "9:16",
  "cropX": 620,
  "cropY": 0,
  "cropWidth": 608,
  "cropHeight": 1080,
  "confidence": 0.88,
  "fallbackUsed": false
}
```

---

# 11. `summary_segments`

Stores editable chronological summary selections.

| Column | Type | Rules |
|---|---|---|
| `id` | uuid | PK |
| `project_id` | uuid | FK projects |
| `source_job_id` | uuid | FK processing_jobs |
| `segment_order` | integer | Required |
| `start_time` | numeric | Required |
| `end_time` | numeric | Required |
| `reason` | text | Required |
| `selected` | boolean | Default true |
| `created_at` | timestamptz | Required |
| `updated_at` | timestamptz | Required |

Constraints:

```text
end_time > start_time
segment_order >= 0
unique(project_id, segment_order)
```

Rules:

- Preserve chronological order in MVP.
- Selected segments should not overlap unless explicitly supported later.

Recommended index:

```text
(project_id, segment_order)
```

---

# 12. `rendered_outputs`

Stores final downloadable clip and summary files.

| Column | Type | Rules |
|---|---|---|
| `id` | uuid | PK |
| `project_id` | uuid | FK projects |
| `render_job_id` | uuid | FK processing_jobs |
| `clip_candidate_id` | uuid nullable | FK clip_candidates |
| `type` | enum | `clip` or `summary` |
| `title` | text | Required |
| `storage_path` | text | Internal only |
| `file_name` | text | Required |
| `mime_type` | text | Usually `video/mp4` |
| `file_size_bytes` | bigint | Required |
| `duration_seconds` | numeric | Required |
| `width` | integer | Required |
| `height` | integer | Required |
| `video_codec` | text | Expected H.264 |
| `audio_codec` | text | Expected AAC |
| `status` | enum | Required |
| `expires_at` | timestamptz | Required |
| `deleted_at` | timestamptz nullable | Optional |
| `created_at` | timestamptz | Required |

Output statuses:

```text
ready
failed
expired
deleted
```

Recommended indexes:

```text
(project_id, created_at desc)
(expires_at) where deleted_at is null
```

Idempotency recommendation:

```text
unique(render_job_id, clip_candidate_id)
```

For summary output, enforce one summary output row per render job by application rule or partial unique index.

---

# 13. `credit_ledger`

Immutable source of truth for credit movement.

Never update, delete, or truncate ledger rows. The database rejects all three operations with
immutability triggers.

| Column | Type | Rules |
|---|---|---|
| `id` | uuid | PK |
| `user_id` | uuid/text | FK users |
| `type` | enum | Required |
| `amount` | integer | Non-zero signed amount |
| `project_id` | uuid nullable | FK projects |
| `processing_job_id` | uuid nullable | FK processing_jobs |
| `stripe_payment_id` | uuid nullable | FK stripe_payments |
| `description` | text | Required |
| `idempotency_key` | text | Required, unique |
| `created_at` | timestamptz | Required |

Ledger types:

```text
purchase
processing_deduction
refund
manual_adjustment
expiration_adjustment
```

Examples:

```text
purchase: +40
processing_deduction: -11
refund: +11
```

Critical constraints:

```text
amount != 0
unique(idempotency_key)
purchase/refund amounts > 0
processing deduction amounts < 0
purchase requires stripe_payment_id
processing deduction/refund require project_id and processing_job_id
processing deductions equal -processing_jobs.credits_charged
refunds exactly reverse an eligible failed-job deduction
one processing deduction and one refund per processing job
processing-job, project, and user links must be the same ownership tuple
each purchase must reference a paid Stripe payment for the same user and exact credit amount
one purchase ledger row is allowed per Stripe payment
runtime role has read-only access; privileged billing flows write ledger rows
```

Recommended indexes:

```text
(user_id, created_at desc)
(project_id)
(processing_job_id)
```

Balance calculation:

```text
SUM(amount) WHERE user_id = ?
```

For performance, a cached balance may exist later, but the ledger remains authoritative.

---

# 14. `stripe_customers`

Maps RepurposePro users to Stripe customers.

| Column | Type | Rules |
|---|---|---|
| `id` | uuid | PK |
| `user_id` | uuid/text | FK users, unique |
| `stripe_customer_id` | text | Unique |
| `created_at` | timestamptz | Required |
| `updated_at` | timestamptz | Required |

---

# 15. `stripe_payments`

Stores confirmed payment records.

| Column | Type | Rules |
|---|---|---|
| `id` | uuid | PK |
| `user_id` | uuid/text | FK users |
| `stripe_customer_id` | text nullable | |
| `stripe_checkout_session_id` | text nullable | Unique where present |
| `stripe_payment_intent_id` | text nullable | Unique where present |
| `stripe_event_id` | text | Unique |
| `pack_code` | text | `starter`, `creator`, `pro` |
| `amount_cents` | integer | Required |
| `currency` | text | Usually `usd` |
| `credits_granted` | integer | Required |
| `status` | enum | Required |
| `created_at` | timestamptz | Required |

Statuses:

```text
pending
paid
failed
refunded
```

Critical rule:

```text
Do not grant credits directly from untrusted client values.
The purchase-ledger trigger accepts only a paid payment whose credits_granted equals the ledger amount.
Payment identity and financial terms are immutable. Only documented status transitions are allowed.
```

Unique Stripe event, checkout session, and payment intent identifiers prevent duplicate payment records.

The server maps trusted pack code to:

```text
Stripe price ID
price
credits
```

---

# 16. `stripe_webhook_events`

Recommended for webhook idempotency.

| Column | Type | Rules |
|---|---|---|
| `id` | uuid | PK |
| `stripe_event_id` | text | Unique |
| `event_type` | text | Required |
| `processed_at` | timestamptz nullable | |
| `status` | enum | Required |
| `error_message` | text nullable | Sanitized |
| `created_at` | timestamptz | Required |

Statuses:

```text
received
processed
failed
ignored
```

Critical constraint:

```text
unique(stripe_event_id)
```

The webhook handler must claim this record atomically before it creates a payment or purchase ledger row.
Webhook identity is immutable; status changes follow a constrained transition path.

---

# 17. Recommended Enums

## `project_output_type`

```text
clips
summary
```

## `project_status`

```text
draft
uploaded
waiting_for_payment
queued
transcribing
analyzing
preview_ready
waiting_for_user_edits
rendering
completed
failed
refunded
deleted
```

## `processing_job_type`

```text
analyze_video
render_clips
render_summary
regenerate_clip_candidate
cleanup_expired_project_files
```

## `processing_job_status`

```text
queued
active
completed
failed
refunded
cancelled
```

## `processing_step`

```text
queued
preparing
extracting_audio
transcribing
analyzing
generating_preview
preview_ready
rendering
saving_output
completed
failed
```

## `ledger_type`

```text
purchase
processing_deduction
refund
manual_adjustment
expiration_adjustment
```

## `output_type`

```text
clip
summary
```

---

# 18. Key Relationships

```text
users
  1 -> many projects
  1 -> many credit_ledger
  1 -> many stripe_payments
  1 -> 1 stripe_customers

projects
  1 -> 1 uploaded_videos
  1 -> many processing_jobs
  1 -> 0..1 transcripts
  1 -> many clip_candidates
  1 -> many summary_segments
  1 -> many rendered_outputs

transcripts
  1 -> many transcript_segments

processing_jobs
  1 -> many clip_candidates
  1 -> many summary_segments
  1 -> many rendered_outputs
```

---

# 19. Billing Invariants

These rules are mandatory.

## Invariant 1

Credits are deducted before analysis begins.

## Invariant 2

The worker never deducts credits.

## Invariant 3

Every credit movement produces one immutable ledger row.

## Invariant 4

Duplicate Stripe events cannot duplicate credits.

## Invariant 5

One processing job cannot receive more than one automatic refund.

## Invariant 6

Refunds for normal processing failures return credits, not Stripe money.

## Invariant 7

A user's balance is the sum of their ledger entries.

---

# 20. Recommended Transaction Boundaries

## Starting analysis

One database transaction should:

```text
lock/check user credit state
recalculate required credits
insert deduction ledger row
create processing job
update project status
commit
```

Then enqueue after commit.

If queueing fails permanently, use recovery logic to refund or requeue safely.

---

## Stripe payment processing

One transaction should:

```text
insert/verify webhook event
insert payment record
insert purchase ledger row
mark webhook processed
commit
```

All guarded by unique constraints.

---

## Automatic failure refund

One transaction should:

```text
lock processing job
verify refund eligibility
verify not already refunded
insert refund ledger row
mark refund_completed_at
update project/job status
commit
```

---

# 21. Retention Rules

File-backed resources expire after 7 days.

Delete:

```text
source videos
extracted audio
temporary files
rendered clips
summary videos
preview assets if any
```

Keep:

```text
user account
payment records
credit ledger
minimal project history
minimal job history
```

Use:

```text
expires_at
deleted_at
```

Cleanup must be idempotent.

---

# 22. Ownership Rules

Every request should authorize through the project owner.

Recommended:

```text
SELECT project WHERE id = :projectId AND user_id = :authenticatedUserId
```

Do not authorize only by:

- clip ID
- output ID
- uploaded video ID

Always scope child resources through owned project context.

---

# 23. Optimistic Concurrency

For frequently edited clip metadata, use a `version` integer.

Update pattern:

```text
UPDATE clip_candidates
SET ..., version = version + 1
WHERE id = ? AND version = ?
```

Return conflict if no row updated.

Recommended API error:

```text
CLIP_VERSION_CONFLICT
```

This prevents silent overwrite from multiple tabs.

---

# 24. Queue Payload Rule

BullMQ job payloads should contain IDs only.

Good:

```json
{
  "jobId": "job_...",
  "projectId": "prj_..."
}
```

Bad:

```json
{
  "videoBytes": "...",
  "fullTranscript": "...",
  "captions": [...]
}
```

Workers should load authoritative data from PostgreSQL and storage.

---

# 25. Database-to-Vertical-Slice Map

| Table | First Required Slice |
|---|---|
| Better Auth tables | VS1 |
| projects | VS2 |
| uploaded_videos | VS2 |
| credit_ledger | VS3 |
| stripe_customers | VS3 |
| stripe_payments | VS3 |
| stripe_webhook_events | VS3 |
| processing_jobs | VS3 |
| transcripts | VS4 |
| transcript_segments | VS4 |
| clip_candidates | VS4 |
| rendered_outputs | VS6 |
| summary_segments | VS8 |

---

# 26. Migration Rules

Coding agents must:

- Never edit an already-applied production migration.
- Generate a new migration for schema changes.
- Keep migrations reviewable.
- Add constraints and indexes explicitly.
- Test forward migration locally.
- Document destructive migrations.

## Database roles

Use separate credentials:

```text
repurposepro         Compose/bootstrap superuser; role provisioning only
repurposepro_owner   migration owner; never used by API or worker runtime
repurposepro_runtime restricted API and worker role
```

The PostgreSQL Docker image requires its initial `POSTGRES_USER` to be a superuser. Compose
therefore creates `repurposepro` only as a bootstrap role, then its initialization script creates
the fixed non-superuser `repurposepro_owner` and `repurposepro_runtime` roles and transfers
database and `public` schema ownership to `repurposepro_owner`. Do not use the bootstrap role
for migrations after initialization.

The runtime role has no superuser, DDL, replication, or row-security-bypass capability.
It cannot mutate or truncate the ledger, or insert financial source records directly. Billing
procedures added in later VS3 tasks must run with narrowly scoped owner authority after they
validate trusted Stripe/webhook input.

Ledger protection triggers use `ENABLE ALWAYS`, so a privileged replication-mode session cannot
bypass them accidentally. Provision a new local volume through Compose. For an existing volume:

```text
1. Set DATABASE_BOOTSTRAP_URL to the existing elevated owner and run pnpm db:migrate:bootstrap.
2. Set DATABASE_MIGRATION_URL and DATABASE_URL to the fixed owner/runtime roles.
3. Run pnpm db:provision-roles to remove stale memberships and transfer database, schema, and Drizzle tracking ownership.
4. Run pnpm db:migrate as repurposepro_owner. Use DATABASE_URL only for runtime.
```

Avoid schema drift between environments.

---

## 27. Final Rule

The database is not complete because tables exist.

It is complete when:

- Ownership is enforceable.
- Financial invariants are protected.
- Retry/idempotency constraints exist.
- Retention is representable.
- Queue workers can recover from persisted state.
- The schema supports the full vertical slice.
