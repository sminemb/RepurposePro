# RepurposePro API Contracts

## 1. Purpose

This document defines the HTTP API contract for **RepurposePro**.

It is the implementation reference for:

- Frontend developers
- Backend developers
- Coding agents
- Integration tests
- End-to-end tests

The API must remain consistent with:

```text
project-overview.md
architecture.md
build-plan.md
progress-tracker.md
database-schema.md
env-reference.md
```

Core API principles:

```text
authenticated by default
resource ownership enforced
heavy work queued
structured JSON responses
stable error shapes
idempotent paid operations
IDs in queue payloads, never large blobs
```

---

## 2. Base Conventions

Recommended API prefix:

```text
/api/v1
```

Example:

```text
POST /api/v1/projects
```

All timestamps use ISO 8601 UTC strings:

```text
2026-07-10T14:30:00.000Z
```

All IDs should use opaque application-generated IDs.

Recommended:

```text
UUID
```

Do not expose sequential database IDs.

---

## 3. Authentication

Authentication is required for all endpoints except:

```text
POST /auth/signup
POST /auth/login
POST /billing/webhook
```

The authenticated user ID must come from the server-side session.

Never trust:

```text
userId
ownerId
accountId
```

from the request body for authorization.

Every project-scoped endpoint must verify:

```text
project.user_id == authenticated_user.id
```

---

## 4. Standard Success Shape

For single-resource responses:

```json
{
  "data": {}
}
```

For collections:

```json
{
  "data": [],
  "meta": {
    "nextCursor": null
  }
}
```

For simple actions:

```json
{
  "data": {
    "success": true
  }
}
```

---

## 5. Standard Error Shape

All API errors should use:

```json
{
  "error": {
    "code": "PROJECT_NOT_FOUND",
    "message": "Project not found.",
    "details": null,
    "requestId": "req_..."
  }
}
```

Fields:

| Field | Type | Required | Purpose |
|---|---|---|---|
| `code` | string | Yes | Stable machine-readable code |
| `message` | string | Yes | Human-readable message |
| `details` | object/null | Yes | Validation or contextual details |
| `requestId` | string | Yes | Support/debug correlation |

Do not expose:

- Stack traces
- Raw SQL
- Redis internals
- Stripe secrets
- Gemini responses containing sensitive internals
- FFmpeg command internals unless explicitly sanitized

---

## 6. HTTP Status Rules

| Status | Use |
|---|---|
| 200 | Successful read/update/action |
| 201 | Resource created |
| 202 | Background job accepted |
| 204 | Successful deletion with no body |
| 400 | Invalid request |
| 401 | Not authenticated |
| 403 | Authenticated but forbidden |
| 404 | Resource not found |
| 409 | Conflict or invalid state transition |
| 413 | File too large |
| 422 | Validation failure |
| 429 | Rate limited |
| 500 | Unexpected internal failure |
| 503 | Dependency unavailable |

---

## 7. Shared Enums

### Project Output Type

```text
clips
summary
```

### Project Status

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

### Processing Job Status

```text
queued
active
completed
failed
refunded
cancelled
```

### Processing Step

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

### Output Type

```text
clip
summary
```

### Credit Ledger Type

```text
purchase
processing_deduction
refund
manual_adjustment
expiration_adjustment
```

---

# 8. Auth Endpoints

## POST `/auth/signup`

Creates an account.

### Request

```json
{
  "name": "Jane Creator",
  "email": "jane@example.com",
  "password": "strong-password"
}
```

### Response — 201

```json
{
  "data": {
    "user": {
      "id": "usr_...",
      "name": "Jane Creator",
      "email": "jane@example.com"
    }
  }
}
```

### Errors

```text
AUTH_EMAIL_ALREADY_EXISTS
AUTH_INVALID_PASSWORD
AUTH_SIGNUP_FAILED
```

---

## POST `/auth/login`

### Request

```json
{
  "email": "jane@example.com",
  "password": "strong-password"
}
```

### Response — 200

```json
{
  "data": {
    "user": {
      "id": "usr_...",
      "name": "Jane Creator",
      "email": "jane@example.com"
    }
  }
}
```

### Errors

```text
AUTH_INVALID_CREDENTIALS
AUTH_LOGIN_FAILED
```

---

## POST `/auth/logout`

### Response — 200

```json
{
  "data": {
    "success": true
  }
}
```

---

# 9. Project Endpoints

## POST `/projects`

Creates a new project.

### Request

```json
{
  "name": "Creator Burnout Podcast",
  "outputType": "clips"
}
```

### Validation

```text
name: 1–120 characters
outputType: clips | summary
```

### Response — 201

```json
{
  "data": {
    "id": "prj_...",
    "name": "Creator Burnout Podcast",
    "outputType": "clips",
    "status": "draft",
    "createdAt": "2026-07-10T14:30:00.000Z"
  }
}
```

---

## GET `/projects`

Returns projects owned by the authenticated user.

### Query Parameters

```text
cursor?
limit?
status?
outputType?
```

Recommended max limit:

```text
50
```

### Response — 200

```json
{
  "data": [
    {
      "id": "prj_...",
      "name": "Creator Burnout Podcast",
      "outputType": "clips",
      "status": "preview_ready",
      "clipCount": 8,
      "createdAt": "2026-07-10T14:30:00.000Z",
      "expiresAt": "2026-07-17T14:30:00.000Z"
    }
  ],
  "meta": {
    "nextCursor": null
  }
}
```

---

## GET `/projects/:projectId`

### Response — 200

```json
{
  "data": {
    "id": "prj_...",
    "name": "Creator Burnout Podcast",
    "outputType": "clips",
    "status": "preview_ready",
    "createdAt": "2026-07-10T14:30:00.000Z",
    "updatedAt": "2026-07-10T15:02:00.000Z"
  }
}
```

### Errors

```text
PROJECT_NOT_FOUND
PROJECT_ACCESS_DENIED
```

---

## PATCH `/projects/:projectId`

### Request

```json
{
  "name": "Updated Project Name"
}
```

### Response — 200

```json
{
  "data": {
    "id": "prj_...",
    "name": "Updated Project Name"
  }
}
```

---

## DELETE `/projects/:projectId`

Deletes project files and marks project deleted.

Billing history and immutable ledger history remain.

### Response — 204

No body.

### Errors

```text
PROJECT_NOT_FOUND
PROJECT_DELETE_FAILED
```

---

# 10. Upload Endpoints

## POST `/projects/:projectId/upload`

Uploads one local source video.

Use multipart form data.

### Form Field

```text
file
```

### Limits

```text
Maximum file size: 500 MB
Accepted containers: MP4, MOV, WebM, MKV
```

### Current VS2-T5 Processing

The endpoint should:

1. Verify ownership and draft status.
2. Validate file size, declared MIME type, and extension.
3. Save the source with generated private filenames under the configured storage root.
4. Probe the generated source path with `ffprobe` and reject unreadable, unsupported, over-limit, or audio-less media.
5. Persist the validated metadata and mark the project uploaded.

Credit calculation and the metadata UI are introduced by VS2-T6 through VS2-T7.

### Response — 201

```json
{
  "data": {
    "success": true
  }
}
```

### Errors

```text
UPLOAD_FILE_TOO_LARGE
UPLOAD_INVALID_FILE
UPLOAD_INVALID_VIDEO
UPLOAD_PROBE_FAILED
UPLOAD_STORAGE_FAILED
PROJECT_NOT_FOUND
PROJECT_UPLOAD_NOT_ALLOWED
```

### Error Example — 413

```json
{
  "error": {
    "code": "UPLOAD_FILE_TOO_LARGE",
    "message": "This file is larger than 500 MB.",
    "details": {
      "maxBytes": 524288000
    },
    "requestId": "req_..."
  }
}
```

---

## GET `/projects/:projectId/video`

### Response — 200

```json
{
  "data": {
    "id": "vid_...",
    "fileName": "podcast-episode.mp4",
    "durationSeconds": 612.4,
    "fileSizeBytes": 184233991,
    "width": 1920,
    "height": 1080,
    "fps": 30,
    "hasAudio": true,
    "expiresAt": "2026-07-17T14:30:00.000Z",
    "requiredCredits": 11
  }
}
```

`requiredCredits` is derived from validated persisted `durationSeconds`: one credit per
started minute, rounded up. It is an estimate only; VS3 recalculates it inside the paid
processing transaction.

### Errors

```text
PROJECT_NOT_FOUND
```

---

## DELETE `/projects/:projectId/video`

Deletes the source video if project state allows it.

### Response — 204

---

# 11. Processing Endpoints

## POST `/projects/:projectId/analyze`

Starts paid analysis.

### Preconditions

- Authenticated user owns project.
- Valid uploaded video exists.
- User has enough credits.
- Required credits are known.

### Atomic Operation

The backend must:

1. Lock the owned project and the user's credit activity.
2. Recalculate required credits from persisted duration.
3. Check balance.
4. Create one database-queued processing job.
5. Deduct credits and write an immutable ledger row.
6. Set the project status to `queued` and its `current_job_id`.
7. Commit all changes in one transaction.

Never deduct credits in the worker.

The initial VS3 endpoint only persists the queued job. BullMQ enqueue and recovery behavior are
introduced in VS3-T6.

When a retry finds the owned project's current `analyze_video` job is `queued` or `active`, it
returns that stored job and its original `creditsCharged` with no second deduction. A current job
of any other type is not reusable by this endpoint.

### Request

```json
{
  "confirmed": true
}
```

### Response — 202

```json
{
  "data": {
    "jobId": "job_...",
    "projectId": "prj_...",
    "status": "queued",
    "creditsCharged": 11
  }
}
```

### Errors

| Status | Code | Meaning |
|---|---|---|
| 404 | `PROJECT_NOT_FOUND` | The project does not exist for the authenticated user. |
| 409 | `PROCESSING_INVALID_PROJECT_STATE` | The project cannot begin paid processing in its current state. |
| 409 | `PROCESSING_VIDEO_REQUIRED` | No active uploaded video with usable duration and audio exists. |
| 409 | `BILLING_INSUFFICIENT_CREDITS` | Persisted credit balance is lower than `ceil(durationSeconds / 60)`. |
| 422 | `PROCESSING_CONFIRMATION_REQUIRED` | The request body is not exactly `{ "confirmed": true }`. |
| 429 | `RATE_LIMIT_EXCEEDED` | The authenticated user exceeded three analysis starts in one minute. |
| 503 | `BILLING_DEDUCTION_FAILED` | The atomic database operation returned an unexpected or unavailable result. |
| 503 | `PROCESSING_START_UNAVAILABLE` | Arcjet or its configuration is unavailable; no internal detail is exposed. |

---

## GET `/projects/:projectId/jobs/:jobId/status`

### Response — 200

```json
{
  "data": {
    "id": "job_...",
    "status": "active",
    "step": "transcribing",
    "progress": 42,
    "message": "Transcribing your video.",
    "startedAt": "2026-07-10T14:35:00.000Z",
    "completedAt": null
  }
}
```

Rules:

- `progress` may be null when exact progress is unknown.
- Do not fake precision.
- Prefer step-based status.

---

## GET `/projects/:projectId/status`

### Response — 200

```json
{
  "data": {
    "projectId": "prj_...",
    "status": "transcribing",
    "currentJob": {
      "id": "job_...",
      "status": "active",
      "step": "transcribing",
      "progress": 42
    }
  }
}
```

---

# 12. Clip Endpoints

## GET `/projects/:projectId/clips`

### Response — 200

```json
{
  "data": [
    {
      "id": "clip_...",
      "title": "Why Most Creators Burn Out",
      "startTime": 412.5,
      "endTime": 486.2,
      "durationSeconds": 73.7,
      "score": 92,
      "reason": "Strong hook, useful insight, and clear emotional delivery.",
      "selected": true,
      "deleted": false,
      "isBackup": false,
      "captions": {
        "enabled": true,
        "style": "hormozi",
        "fontSize": 64,
        "position": {
          "x": 0.5,
          "y": 0.72
        },
        "lines": []
      }
    }
  ]
}
```

---

## GET `/projects/:projectId/clips/:clipId`

Returns one clip candidate.

### Response — 200

Same shape as one item above.

---

## PATCH `/projects/:projectId/clips/:clipId`

Updates preview metadata.

### Request Example

```json
{
  "title": "Why Creators Burn Out",
  "startTime": 414.2,
  "endTime": 484.7,
  "selected": true,
  "captions": {
    "enabled": true,
    "fontSize": 72,
    "position": {
      "x": 0.5,
      "y": 0.74
    },
    "lines": [
      {
        "start": 0,
        "end": 2.5,
        "text": "Most creators burn out because they lack systems.",
        "highlights": ["burn out", "systems"]
      }
    ]
  }
}
```

### Validation

- `endTime > startTime`
- `startTime >= 0`
- `endTime <= sourceDuration`
- Caption position normalized to `0..1`
- Caption lines remain inside clip duration
- Font size within allowed UI/render range

### Response — 200

Returns updated clip.

### Errors

```text
CLIP_NOT_FOUND
CLIP_INVALID_TIME_RANGE
CLIP_OUTSIDE_SOURCE_DURATION
CLIP_INVALID_CAPTION_METADATA
```

---

## DELETE `/projects/:projectId/clips/:clipId`

Soft-deletes or deselects a clip candidate.

### Response — 204

---

## POST `/projects/:projectId/clips/:clipId/regenerate`

Replaces one bad clip.

### Behavior

1. Use unused backup candidate first.
2. Use Gemini only if backups are exhausted.
3. Do not deduct extra credits within the same paid MVP project.
4. Affect only the requested clip slot.

### Response — 202 or 200

If backup candidate is available synchronously:

```json
{
  "data": {
    "replacementClipId": "clip_...",
    "source": "backup_candidate"
  }
}
```

If new AI generation is queued:

```json
{
  "data": {
    "jobId": "job_...",
    "status": "queued",
    "source": "gemini_regeneration"
  }
}
```

---

# 13. Summary Endpoints

## GET `/projects/:projectId/summary`

### Response — 200

```json
{
  "data": {
    "targetDurationSeconds": 180,
    "currentDurationSeconds": 184,
    "segments": [
      {
        "id": "sumseg_...",
        "startTime": 120,
        "endTime": 185.4,
        "durationSeconds": 65.4,
        "reason": "Introduces the main topic and gives necessary context.",
        "selected": true,
        "order": 1
      }
    ]
  }
}
```

---

## PATCH `/projects/:projectId/summary`

Updates summary segment metadata.

### Request

```json
{
  "segments": [
    {
      "id": "sumseg_...",
      "startTime": 122.3,
      "endTime": 183.9,
      "selected": true
    }
  ]
}
```

### Rules

- Preserve chronological order.
- No overlapping selected segments unless explicitly supported later.
- End must be greater than start.
- Segments must stay within source duration.

### Response — 200

Returns updated summary state.

---

# 14. Render Endpoints

## POST `/projects/:projectId/render`

Starts final rendering.

### Request — clips project

```json
{
  "type": "clips",
  "clipIds": [
    "clip_1",
    "clip_2"
  ]
}
```

### Request — summary project

```json
{
  "type": "summary"
}
```

### Preconditions

- Project belongs to user.
- Project is preview-ready or waiting for user edits.
- Requested clips belong to project.
- At least one selected clip exists for clip render.
- Latest metadata is persisted.

### Response — 202

```json
{
  "data": {
    "jobId": "job_...",
    "status": "queued",
    "outputCount": 2
  }
}
```

### Errors

```text
RENDER_INVALID_PROJECT_STATE
RENDER_NO_CLIPS_SELECTED
RENDER_CLIP_NOT_FOUND
RENDER_ALREADY_RUNNING
QUEUE_UNAVAILABLE
```

---

# 15. Output Endpoints

## GET `/projects/:projectId/outputs`

### Response — 200

```json
{
  "data": [
    {
      "id": "out_...",
      "type": "clip",
      "title": "Why Most Creators Burn Out",
      "durationSeconds": 73.7,
      "fileSizeBytes": 18723322,
      "width": 1080,
      "height": 1920,
      "status": "ready",
      "createdAt": "2026-07-10T15:30:00.000Z",
      "expiresAt": "2026-07-17T15:30:00.000Z"
    }
  ]
}
```

---

## GET `/projects/:projectId/outputs/:outputId/download`

Authorizes and streams/downloads the file.

### Rules

- Verify ownership.
- Reject expired output.
- Reject deleted output.
- Do not reveal raw filesystem path.

### Response

Binary MP4 file.

Recommended headers:

```text
Content-Type: video/mp4
Content-Disposition: attachment; filename="why-most-creators-burn-out.mp4"
```

### Errors

```text
OUTPUT_NOT_FOUND
OUTPUT_EXPIRED
OUTPUT_DELETED
OUTPUT_FILE_MISSING
```

---

## DELETE `/projects/:projectId/outputs/:outputId`

Deletes one rendered output.

### Response — 204

---

# 16. Billing Endpoints

## GET `/billing/credits`

Authenticated endpoint. It accepts no identity input; server derives ledger owner from session.

### Response Headers

```text
Cache-Control: private, no-store
```

### Response — 200

```json
{
  "data": {
    "balance": 89,
    "unit": "credits",
    "conversion": "1 credit = 1 video minute"
  }
}
```

### Errors

| Status | Code | Message |
|---:|---|---|
| 401 | `UNAUTHORIZED` | You need to sign in to access this resource. |
| 500 | `BILLING_BALANCE_INVALID` | We could not verify your credit balance. Try again. |
| 503 | `BILLING_CREDITS_UNAVAILABLE` | Your credit balance is temporarily unavailable. Try again. |

All errors use standard safe envelope with `details: null` and request ID.

---

## GET `/billing/ledger`

Returns a read-only, newest-first page of the authenticated user's immutable credit-ledger
entries. The server derives the owner from the authenticated session; it never accepts a user,
account, or project owner ID from the request. Responses send `Cache-Control: private, no-store`.

### Query Parameters

| Name | Required | Rules |
|---|---|---|
| `cursor` | No | Opaque continuation token encoding the last returned `(createdAt, id)` pair. Do not construct or interpret it on the client. |
| `limit` | No | Integer from `1` through `50`; defaults to `20`. |
| `type` | No | One of `purchase`, `processing_deduction`, `refund`, `manual_adjustment`, or `expiration_adjustment`. |

Pages use descending `createdAt`, then descending `id` ordering. A non-null `nextCursor` continues
strictly after the final returned entry, so entries are not repeated across stable page boundaries.

### Response — 200

```json
{
  "data": [
    {
      "id": "3b616994-3c68-4ca2-ac9a-df1acf6d07b1",
      "type": "processing_deduction",
      "amount": -11,
      "description": "Processed Creator Burnout Podcast",
      "projectId": "prj_...",
      "createdAt": "2026-07-10T14:34:00.000Z"
    }
  ],
  "meta": {
    "nextCursor": "eyJjcmVhdGVkQXQiOiIyMDI2LTA3LTEwVDE0OjM0OjAwLjAwMFoiLCJpZCI6IjNiNjE2OTk0LTNjNjgtNGNhMi1hYzlhLWRmMWFjZjZkMDdiMSJ9"
  }
}
```

Each entry exposes only `id`, `type`, signed `amount`, `description`, nullable `projectId`, and
ISO-8601 `createdAt`. Stripe event IDs, Checkout/payment metadata, and any client-supplied owner
fields are not part of this contract.

### Errors

| Status | Code | Message |
|---:|---|---|
| 400 | `BILLING_LEDGER_QUERY_INVALID` | Invalid credit ledger query. |
| 401 | `UNAUTHORIZED` | You need to sign in to access this resource. |
| 503 | `BILLING_LEDGER_UNAVAILABLE` | Your credit history is temporarily unavailable. Try again. |

All errors use the standard safe envelope with `details: null` and a request ID.

---

## POST `/billing/checkout`

Creates one Stripe payment-mode Checkout session for an approved credit pack.

Authentication is required. The API derives the customer email and user correlation ID from
the server-side session; the request must not contain identity, price, or credit fields.

### Request

```json
{
  "pack": "creator"
}
```

Allowed values:

```text
starter
creator
pro
```

### Response — 201

```json
{
  "data": {
    "checkoutUrl": "https://checkout.stripe.com/..."
  }
}
```

Do not accept arbitrary price or credit amount from the client.

The server maps pack ID to a trusted Stripe Price ID. It limits Checkout creation to three
attempts per authenticated user per minute.

The Checkout-entry request is intentionally database-free. It must not create a payment,
customer, or credit-ledger record, and it must not grant credits. Only the signature-verified
webhook flow may persist payment state or grant credits.

### Errors

| Status | Code | Meaning |
|---|---|---|
| 401 | `UNAUTHORIZED` | No authenticated session is available. |
| 422 | `BILLING_PACK_INVALID` | The request body is not exactly one approved pack. |
| 429 | `RATE_LIMIT_EXCEEDED` | The authenticated user exceeded three Checkout attempts in one minute. |
| 503 | `BILLING_CHECKOUT_UNAVAILABLE` | Stripe, Arcjet, or Checkout configuration is unavailable; no internal detail is exposed. |

---

## POST `/billing/webhook`

Stripe webhook endpoint.

### Requirements

- No user session required.
- Verify Stripe signature.
- Persist event ID.
- Process idempotently.
- Grant credits only after confirmed successful payment event.
- Return 2xx for already-processed valid event.

### Response — 200

```json
{
  "received": true
}
```

---

# 17. Refund Contract

Refunds for normal processing failures are **credit refunds**, not Stripe money refunds.

Eligible failures may include:

```text
audio extraction failure
Whisper failure
Gemini failure
invalid Gemini output after retry policy exhausted
FFmpeg render failure before usable output
worker crash that permanently fails job
storage failure that prevents usable result
```

The exact eligibility policy must remain centralized.

Refund transaction must be idempotent.

Recommended uniqueness:

```text
one refund ledger row per processing job
```

---

# 18. Rate Limiting and Abuse Protection

Protect at minimum:

```text
POST /auth/signup
POST /auth/login
POST /projects
POST /projects/:projectId/upload
POST /projects/:projectId/analyze
POST /projects/:projectId/render
POST /billing/checkout
```

Expected response on limit:

```text
429 Too Many Requests
```

Error code:

```text
RATE_LIMIT_EXCEEDED
```

---

# 19. Idempotency Rules

The following operations must be idempotent:

```text
Stripe webhook processing
credit refund
processing-job creation for one confirmed paid action
render retries
cleanup jobs
worker retries where possible
```

Never duplicate:

- Credit purchase grant
- Credit deduction
- Credit refund
- Rendered output rows for same render attempt
- Stripe payment records

---

# 20. Polling Rules

For MVP, frontend polling is acceptable.

Recommended active polling interval:

```text
2–5 seconds
```

Rules:

- Slow down when browser tab is hidden.
- Stop on terminal job states.
- Do not create duplicate analysis/render requests while polling.

Terminal states:

```text
completed
failed
refunded
cancelled
```

---

# 21. Validation Ownership

Validation belongs in multiple layers.

Frontend:

```text
fast UX feedback
```

API:

```text
authoritative request validation
authorization
business rules
```

Worker:

```text
job payload validation
file existence
project/job state validation
```

AI layer:

```text
structured output schema validation
timestamp validation
duplicate removal
```

---

# 22. Endpoint-to-Vertical-Slice Map

| Endpoint Group | First Required Slice |
|---|---|
| Auth | VS1 |
| Projects | VS2 |
| Upload | VS2 |
| Billing | VS3 |
| Processing | VS3–VS4 |
| Clips | VS4–VS7 |
| Summary | VS8 |
| Render | VS6 |
| Outputs | VS6 |
| Refund behavior | VS9 |
| Cleanup-related state | VS10 |

---

## 23. Final Rule

An API endpoint is not complete until:

- Authentication is correct.
- Ownership is enforced.
- Request validation exists.
- Error codes are stable.
- Response shape is documented.
- Relevant tests exist.
- Expensive work is queued when applicable.
