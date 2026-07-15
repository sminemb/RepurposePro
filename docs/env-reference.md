# RepurposePro Environment Reference

## 1. Purpose

This document defines environment variables used by **RepurposePro**.

It is the reference for:

- Local development
- CI
- Staging
- Production
- Coding agents
- Deployment setup

Never commit real secrets.

Provide:

```text
.env.example
```

with safe placeholders only.

---

## 2. Environment File Strategy

Recommended files:

```text
.env.example
.env.local
.env.test
```

Do not commit:

```text
.env
.env.local
.env.production
real API keys
real webhook secrets
real database passwords
```

For a monorepo, environment ownership should be explicit.

Example:

```text
apps/web/.env.local
apps/api/.env
apps/worker/.env
```

Or use a secure shared environment loader if preferred.

---

## 3. Environment Validation

Each app should validate required variables at startup.

Recommended behavior:

```text
missing required env
-> fail fast
-> print variable name
-> do not print secret value
```

Use runtime validation.

Recommended:

```text
Zod or equivalent
```

Do not rely on `process.env.X!` without validation.

---

# 4. Core Application Variables

## `NODE_ENV`

Purpose:

```text
Runtime environment.
```

Allowed:

```text
development
test
production
```

Required:

```text
Yes
```

Used by:

```text
web
api
worker
```

Example:

```env
NODE_ENV=development
```

---

## `APP_ENV`

Purpose:

Distinguish deployment environment independently from Node runtime.

Allowed example values:

```text
local
development
staging
production
test
```

Required:

```text
Recommended
```

Used by:

```text
api
worker
web
```

---

## `APP_URL`

Purpose:

Public frontend URL.

Required:

```text
Yes
```

Used by:

```text
web
api
Better Auth
Stripe redirects
```

Example:

```env
APP_URL=http://localhost:3000
```

Production example format:

```text
https://app.example.com
```

---

## `API_URL`

Purpose:

Frontend-accessible API base URL.

Required:

```text
Yes
```

Used by:

```text
web
```

Example:

```env
API_URL=http://localhost:4000/api/v1
```

For Next.js client-side exposure, use the appropriate public prefix only if the value is safe to expose.

Example:

```env
NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1
```

---

## `API_PORT`

Purpose:

NestJS API port.

Required:

```text
Yes for local/server runtime
```

Example:

```env
API_PORT=4000
```

---

# 5. Database Variables

## `DATABASE_URL`

Purpose:

PostgreSQL connection string.

Required:

```text
Yes
```

Used by:

```text
api
worker
```

Secret:

```text
Yes
```

Example format:

```env
DATABASE_URL=postgresql://user:password@localhost:5432/repurposepro
```

Do not commit real credentials.

---

## `DATABASE_MIGRATION_URL`

Purpose:

Dedicated `repurposepro_owner` connection string for Drizzle migrations.

Required:

```text
Yes after VS3-T1.1 role hardening
```

Used by:

```text
migration tooling only
```

Never use this credential in API or worker runtime.

Migration tooling requires this URL and rejects every other role. It never falls back to
`DATABASE_URL`.

For a fresh Compose volume, `POSTGRES_USER` is the bootstrap-only `repurposepro` superuser;
the initialization script creates the non-superuser `repurposepro_owner` used by this URL.

---

## `DATABASE_BOOTSTRAP_URL`

Purpose:

Temporary elevated connection string used only by `pnpm db:provision-roles` when upgrading an
existing PostgreSQL volume to separated owner/runtime roles.

Required:

```text
Existing-volume upgrade only
```

Never use this credential in API or worker runtime. Remove it after role provisioning.
Use it with `pnpm db:migrate:bootstrap` only to migrate an existing pre-role-split volume before
the owner URL can be used.

---

## `DATABASE_POOL_MAX`

Purpose:

Maximum connection pool size.

Required:

```text
No
```

Recommended local default:

```env
DATABASE_POOL_MAX=10
```

Used by:

```text
api
worker
```

---

## `DATABASE_SSL`

Purpose:

Enable SSL for hosted PostgreSQL.

Required:

```text
No
```

Allowed:

```text
true
false
```

Example:

```env
DATABASE_SSL=false
```

---

# 6. Redis and BullMQ Variables

## `REDIS_URL`

Purpose:

Redis connection string.

Required:

```text
Yes
```

Used by:

```text
api
worker
BullMQ
```

Secret:

```text
Potentially
```

Example:

```env
REDIS_URL=redis://localhost:6379
```

Authenticated format:

```text
redis://default:password@host:6379
```

---

## `BULLMQ_PREFIX`

Purpose:

Namespace BullMQ keys.

Required:

```text
No
```

Recommended:

```env
BULLMQ_PREFIX=repurposepro
```

Useful when sharing one Redis instance.

---

## `ANALYSIS_WORKER_CONCURRENCY`

Purpose:

Concurrent analysis jobs.

Required:

```text
No
```

Recommended MVP default:

```env
ANALYSIS_WORKER_CONCURRENCY=1
```

---

## `RENDER_WORKER_CONCURRENCY`

Purpose:

Concurrent render jobs.

Recommended MVP default:

```env
RENDER_WORKER_CONCURRENCY=1
```

---

## `CLEANUP_WORKER_CONCURRENCY`

Purpose:

Concurrent cleanup jobs.

Recommended MVP default:

```env
CLEANUP_WORKER_CONCURRENCY=1
```

---

# 7. Better Auth Variables

## `BETTER_AUTH_SECRET`

Purpose:

Secret used by Better Auth.

Required:

```text
Yes
```

Secret:

```text
Yes
```

Example:

```env
BETTER_AUTH_SECRET=replace-with-long-random-secret
```

Never reuse a development secret in production.

---

## `BETTER_AUTH_URL`

Purpose:

Canonical auth application URL.

Required:

```text
Yes
```

Example:

```env
BETTER_AUTH_URL=http://localhost:3000
```

Use the exact deployed public URL in production.

---

## `BETTER_AUTH_TRUSTED_ORIGINS`

Purpose:

Optional explicit trusted origins list.

Required:

```text
Depends on deployment
```

Example format:

```env
BETTER_AUTH_TRUSTED_ORIGINS=http://localhost:3000,https://app.example.com
```

---

# 8. Stripe Variables

## `STRIPE_SECRET_KEY`

Purpose:

Server-side Stripe API key.

Required:

```text
Yes for billing
```

Used by:

```text
api
```

Secret:

```text
Yes
```

Example placeholder:

```env
STRIPE_SECRET_KEY=sk_test_...
```

Never expose to browser.

---

## `STRIPE_WEBHOOK_SECRET`

Purpose:

Verify Stripe webhook signatures.

Required:

```text
Yes
```

Used by:

```text
api
```

Secret:

```text
Yes
```

Example placeholder:

```env
STRIPE_WEBHOOK_SECRET=whsec_...
```

---

## `STRIPE_STARTER_PRICE_ID`

Purpose:

Trusted Stripe Price ID for Starter pack.

Required:

```text
Yes if Starter pack enabled
```

Example:

```env
STRIPE_STARTER_PRICE_ID=price_...
```

---

## `STRIPE_CREATOR_PRICE_ID`

Purpose:

Trusted Stripe Price ID for Creator pack.

Example:

```env
STRIPE_CREATOR_PRICE_ID=price_...
```

---

## `STRIPE_PRO_PRICE_ID`

Purpose:

Trusted Stripe Price ID for Pro pack.

Example:

```env
STRIPE_PRO_PRICE_ID=price_...
```

---

## `STRIPE_SUCCESS_URL`

Purpose:

Checkout success redirect.

Recommended:

```env
STRIPE_SUCCESS_URL=http://localhost:3000/billing?checkout=success
```

---

## `STRIPE_CANCEL_URL`

Purpose:

Checkout cancel redirect.

Recommended:

```env
STRIPE_CANCEL_URL=http://localhost:3000/billing?checkout=cancelled
```

---

# 9. Gemini Variables

## `GEMINI_API_KEY`

Purpose:

Authenticate Gemini API requests.

Required:

```text
Yes for AI analysis
```

Used by:

```text
worker
```

Secret:

```text
Yes
```

Example:

```env
GEMINI_API_KEY=replace-with-real-key
```

---

## `GEMINI_CLIP_MODEL`

Purpose:

Model used for clip selection.

Recommended initial value:

```env
GEMINI_CLIP_MODEL=gemini-2.5-flash-lite
```

Implementation note:

Exact model names should be verified against current Gemini documentation when wiring the integration.

---

## `GEMINI_FINAL_RANKING_MODEL`

Purpose:

Model used for harder final ranking.

Recommended initial value:

```env
GEMINI_FINAL_RANKING_MODEL=gemini-2.5-flash
```

---

## `GEMINI_SUMMARY_MODEL`

Purpose:

Model used for summary segment selection.

Recommended initial value:

```env
GEMINI_SUMMARY_MODEL=gemini-2.5-flash
```

---

## `GEMINI_TIMEOUT_MS`

Purpose:

AI request timeout.

Example:

```env
GEMINI_TIMEOUT_MS=120000
```

---

## `GEMINI_MAX_RETRIES`

Purpose:

Maximum retry count for retryable Gemini failures.

Recommended MVP example:

```env
GEMINI_MAX_RETRIES=2
```

Retries must not duplicate financial actions.

---

# 10. Whisper Variables

## `WHISPER_MODEL`

Purpose:

Self-hosted Whisper model name.

Required:

```text
Yes
```

Example:

```env
WHISPER_MODEL=small.en
```

Select based on local worker hardware.

---

## `WHISPER_DEVICE`

Purpose:

Execution device.

Allowed examples:

```text
cpu
cuda
auto
```

Example:

```env
WHISPER_DEVICE=auto
```

---

## `WHISPER_COMPUTE_TYPE`

Purpose:

Compute precision for implementations such as faster-whisper.

Examples:

```text
int8
float16
float32
```

Example:

```env
WHISPER_COMPUTE_TYPE=int8
```

---

## `WHISPER_ENABLE_WORD_TIMESTAMPS`

Purpose:

Enable word-level timestamps when supported.

Example:

```env
WHISPER_ENABLE_WORD_TIMESTAMPS=true
```

Preferred for captions.

---

## `WHISPER_LANGUAGE`

Purpose:

Force MVP language.

Recommended:

```env
WHISPER_LANGUAGE=en
```

---

# 11. FFmpeg Variables

## `FFMPEG_PATH`

Purpose:

Path to FFmpeg binary.

Required:

```text
Yes unless available on PATH
```

Example:

```env
FFMPEG_PATH=ffmpeg
```

Absolute path example:

```env
FFMPEG_PATH=/usr/local/bin/ffmpeg
```

---

## `FFPROBE_PATH`

Purpose:

Path to ffprobe binary.

Example:

```env
FFPROBE_PATH=ffprobe
```

---

## `FFMPEG_PRESET`

Purpose:

Encoding speed/quality preset.

Recommended MVP:

```env
FFMPEG_PRESET=medium
```

For faster local testing:

```env
FFMPEG_PRESET=veryfast
```

---

## `FFMPEG_CRF`

Purpose:

H.264 quality factor.

Example:

```env
FFMPEG_CRF=20
```

Recommended practical range:

```text
18–23
```

---

## `OUTPUT_VIDEO_CODEC`

Recommended:

```env
OUTPUT_VIDEO_CODEC=libx264
```

---

## `OUTPUT_AUDIO_CODEC`

Recommended:

```env
OUTPUT_AUDIO_CODEC=aac
```

---

# 12. Storage Variables

## `STORAGE_DRIVER`

Purpose:

Select storage implementation.

MVP:

```env
STORAGE_DRIVER=local
```

Future:

```text
s3
r2
minio
```

---

## `STORAGE_ROOT`

Purpose:

Root local storage path.

Required for local storage.

Example:

```env
STORAGE_ROOT=./storage
```

Recommended absolute production-style path:

```text
/var/lib/repurposepro/storage
```

---

## `FILE_RETENTION_DAYS`

Purpose:

File expiration policy.

Recommended MVP:

```env
FILE_RETENTION_DAYS=7
```

Do not silently diverge from UI messaging.

---

## `MAX_UPLOAD_BYTES`

Purpose:

Upload size limit.

Recommended MVP:

```env
MAX_UPLOAD_BYTES=524288000
```

Equivalent to:

```text
500 MB
```

---

## `MAX_VIDEO_DURATION_SECONDS`

Purpose:

MVP duration limit.

Recommended:

```env
MAX_VIDEO_DURATION_SECONDS=1800
```

Equivalent to:

```text
30 minutes
```

---

# 13. Arcjet Variables

## `ARCJET_KEY`

Purpose:

Authenticate Arcjet.

Required when abuse protection is enabled.

Secret:

```text
Yes
```

Example:

```env
ARCJET_KEY=ajkey_...
```

---

## `ARCJET_MODE`

Purpose:

Control local/testing behavior.

Example allowed values:

```text
LIVE
DRY_RUN
```

Example:

```env
ARCJET_MODE=DRY_RUN
```

Use explicit production behavior.

---

# 14. Logging Variables

## `LOG_LEVEL`

Allowed:

```text
debug
info
warn
error
```

Recommended defaults:

```text
development: debug
production: info
```

Example:

```env
LOG_LEVEL=debug
```

---

## `LOG_PRETTY`

Purpose:

Pretty local logs.

Example:

```env
LOG_PRETTY=true
```

Disable in structured production logging.

---

# 15. CORS and Security Variables

## `CORS_ORIGINS`

Purpose:

Allowed frontend origins for API.

Example:

```env
CORS_ORIGINS=http://localhost:3000
```

Multiple:

```env
CORS_ORIGINS=http://localhost:3000,https://app.example.com
```

Do not use wildcard in production with credentials.

---

## `COOKIE_SECURE`

Purpose:

Secure auth cookies.

Recommended:

```text
false locally
true in production
```

Example:

```env
COOKIE_SECURE=false
```

---

# 16. Optional Face Detection Variables

## `FACE_DETECTION_BACKEND`

Purpose:

Select detector implementation.

Example:

```env
FACE_DETECTION_BACKEND=opencv
```

Possible future values:

```text
opencv
mediapipe
retinaface
```

---

## `FACE_SAMPLE_INTERVAL_SECONDS`

Purpose:

How frequently frames are sampled for crop estimation.

Example:

```env
FACE_SAMPLE_INTERVAL_SECONDS=3
```

---

## `FACE_CROP_SMOOTHING_WINDOW`

Purpose:

Controls crop smoothing.

Example:

```env
FACE_CROP_SMOOTHING_WINDOW=5
```

---

# 17. Cleanup Variables

## `CLEANUP_SCHEDULE_CRON`

Purpose:

Schedule expired-file cleanup.

Example:

```env
CLEANUP_SCHEDULE_CRON=0 * * * *
```

Meaning:

```text
hourly
```

If scheduling is managed outside the app, this may be unnecessary.

---

## `CLEANUP_BATCH_SIZE`

Purpose:

Maximum expired records processed per cleanup run.

Example:

```env
CLEANUP_BATCH_SIZE=100
```

---

# 18. Testing Variables

## `TEST_DATABASE_URL`

Purpose:

Dedicated test PostgreSQL database.

Required:

```text
Recommended
```

Example:

```env
TEST_DATABASE_URL=postgresql://user:password@localhost:5432/repurposepro_test
```

Never run destructive tests against production database.

---

## Billing integration test URLs

`billing-integrity.integration.spec.ts` creates and drops a uniquely named disposable database.
Run it only with these three non-production credentials:

```env
TEST_DATABASE_BOOTSTRAP_URL=postgresql://bootstrap:password@localhost:5432/repurposepro
TEST_DATABASE_MIGRATION_URL=postgresql://repurposepro_owner:password@localhost:5432/repurposepro
TEST_DATABASE_RUNTIME_URL=postgresql://repurposepro_runtime:password@localhost:5432/repurposepro
```

The bootstrap role needs `CREATEDB` and may only be used by the test setup. The integration suite
is skipped when any required test URL is absent.

---

## `TEST_REDIS_URL`

Purpose:

Dedicated test Redis.

Example:

```env
TEST_REDIS_URL=redis://localhost:6380
```

---

## `MOCK_GEMINI`

Purpose:

Use deterministic AI mocks.

Example:

```env
MOCK_GEMINI=true
```

---

## `MOCK_WHISPER`

Purpose:

Use transcript fixture instead of real transcription.

Example:

```env
MOCK_WHISPER=true
```

---

## `MOCK_FFMPEG_RENDER`

Purpose:

Skip expensive final rendering in most automated tests.

Example:

```env
MOCK_FFMPEG_RENDER=true
```

Keep at least one real manual processing path.

---

# 19. Public vs Secret Variables

## Safe to expose publicly when needed

Examples:

```text
NEXT_PUBLIC_API_URL
public app URL
non-secret feature flags
```

## Never expose publicly

```text
DATABASE_URL
REDIS_URL with password
BETTER_AUTH_SECRET
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
GEMINI_API_KEY
ARCJET_KEY
```

Rule:

```text
Never prefix a secret with NEXT_PUBLIC_.
```

---

# 20. Recommended `.env.example`

```env
# Runtime
NODE_ENV=development
APP_ENV=local
APP_URL=http://localhost:3000
API_URL=http://localhost:4000/api/v1
API_PORT=4000

# Database
POSTGRES_USER=repurposepro
POSTGRES_PASSWORD=password
POSTGRES_DB=repurposepro
POSTGRES_OWNER_PASSWORD=password
POSTGRES_RUNTIME_PASSWORD=password
DATABASE_URL=postgresql://repurposepro_runtime:password@localhost:5432/repurposepro
DATABASE_MIGRATION_URL=postgresql://repurposepro_owner:password@localhost:5432/repurposepro
# Existing-volume upgrade only; remove after pnpm db:provision-roles.
DATABASE_BOOTSTRAP_URL=
DATABASE_POOL_MAX=10
DATABASE_SSL=false

# Redis / BullMQ
REDIS_URL=redis://localhost:6379
BULLMQ_PREFIX=repurposepro
ANALYSIS_WORKER_CONCURRENCY=1
RENDER_WORKER_CONCURRENCY=1
CLEANUP_WORKER_CONCURRENCY=1

# Better Auth
BETTER_AUTH_SECRET=replace-me
BETTER_AUTH_URL=http://localhost:3000
BETTER_AUTH_TRUSTED_ORIGINS=http://localhost:3000

# Stripe
STRIPE_SECRET_KEY=sk_test_replace_me
STRIPE_WEBHOOK_SECRET=whsec_replace_me
STRIPE_STARTER_PRICE_ID=price_replace_me
STRIPE_CREATOR_PRICE_ID=price_replace_me
STRIPE_PRO_PRICE_ID=price_replace_me
STRIPE_SUCCESS_URL=http://localhost:3000/billing?checkout=success
STRIPE_CANCEL_URL=http://localhost:3000/billing?checkout=cancelled

# Gemini
GEMINI_API_KEY=replace-me
GEMINI_CLIP_MODEL=gemini-2.5-flash-lite
GEMINI_FINAL_RANKING_MODEL=gemini-2.5-flash
GEMINI_SUMMARY_MODEL=gemini-2.5-flash
GEMINI_TIMEOUT_MS=120000
GEMINI_MAX_RETRIES=2

# Whisper
WHISPER_MODEL=small.en
WHISPER_DEVICE=auto
WHISPER_COMPUTE_TYPE=int8
WHISPER_ENABLE_WORD_TIMESTAMPS=true
WHISPER_LANGUAGE=en

# FFmpeg
FFMPEG_PATH=ffmpeg
FFPROBE_PATH=ffprobe
FFMPEG_PRESET=medium
FFMPEG_CRF=20
OUTPUT_VIDEO_CODEC=libx264
OUTPUT_AUDIO_CODEC=aac

# Storage
STORAGE_DRIVER=local
STORAGE_ROOT=./storage
FILE_RETENTION_DAYS=7
MAX_UPLOAD_BYTES=524288000
MAX_VIDEO_DURATION_SECONDS=1800

# Arcjet
ARCJET_KEY=replace-me
ARCJET_MODE=DRY_RUN

# Logging
LOG_LEVEL=debug
LOG_PRETTY=true

# Security
CORS_ORIGINS=http://localhost:3000
COOKIE_SECURE=false

# Face detection
FACE_DETECTION_BACKEND=opencv
FACE_SAMPLE_INTERVAL_SECONDS=3
FACE_CROP_SMOOTHING_WINDOW=5

# Cleanup
CLEANUP_SCHEDULE_CRON=0 * * * *
CLEANUP_BATCH_SIZE=100

# Tests
TEST_DATABASE_BOOTSTRAP_URL=postgresql://bootstrap:password@localhost:5432/repurposepro
TEST_DATABASE_MIGRATION_URL=postgresql://repurposepro_owner:password@localhost:5432/repurposepro
TEST_DATABASE_RUNTIME_URL=postgresql://repurposepro_runtime:password@localhost:5432/repurposepro
TEST_REDIS_URL=redis://localhost:6380
MOCK_GEMINI=true
MOCK_WHISPER=true
MOCK_FFMPEG_RENDER=true
```

---

# 21. App Ownership Matrix

| Variable Group | Web | API | Worker |
|---|---:|---:|---:|
| App URLs | Yes | Yes | Optional |
| Database | No | Yes | Yes |
| Redis | No | Yes | Yes |
| Better Auth | Yes/Server | Yes | No |
| Stripe secret | No | Yes | No |
| Gemini | No | No | Yes |
| Whisper | No | No | Yes |
| FFmpeg | No | Optional probe | Yes |
| Storage | Optional | Yes | Yes |
| Arcjet | Optional | Yes | No |
| Logging | Yes | Yes | Yes |

---

# 22. Vertical-Slice Activation Map

| Slice | New Environment Groups First Needed |
|---|---|
| VS0 | Runtime, database, Redis, logging |
| VS1 | Better Auth, CORS, cookies |
| VS2 | FFprobe, storage, upload limits |
| VS3 | Stripe |
| VS4 | Whisper, Gemini, FFmpeg audio extraction |
| VS5 | No major new env group |
| VS6 | FFmpeg render configuration |
| VS7 | Gemini regeneration settings |
| VS8 | Gemini summary model |
| VS9 | No major new env group |
| VS10 | Cleanup schedule, retention |
| VS11 | Arcjet |
| VS12 | Test env and mocks |

---

# 23. Secret Rotation Rules

When rotating a secret:

- Update secret manager/deployment environment.
- Restart affected service.
- Confirm health.
- Revoke old secret where applicable.
- Do not record secret values in logs or docs.

Especially for:

```text
BETTER_AUTH_SECRET
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
GEMINI_API_KEY
ARCJET_KEY
```

---

## 24. Final Rule

An environment variable should exist only when it controls deployment-specific behavior or secrets.

Do not use env variables for normal product logic that belongs in code or database configuration.

Good env use:

```text
DATABASE_URL
REDIS_URL
GEMINI_API_KEY
MAX_UPLOAD_BYTES
FILE_RETENTION_DAYS
```

Bad env use:

```text
BUTTON_COLOR
DASHBOARD_CARD_RADIUS
PROJECT_STATUS_LABEL
```

UI behavior belongs in `ui-tokens.md`, `ui-rules.md`, and code.
