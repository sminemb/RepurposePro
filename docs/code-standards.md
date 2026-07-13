# RepurposePro Code Standards

## 1. Purpose

This document defines the coding standards for **RepurposePro**, a web app that turns long videos into short vertical clips and summary videos.

These standards are meant to keep the codebase:

- Easy to read
- Easy to maintain
- Safe to change
- Consistent across frontend, backend, and worker code
- Reliable for long-running video-processing jobs
- Secure around uploads, payments, and user data

---

## 2. Tech Stack

RepurposePro uses:

### Frontend

- Next.js
- React
- TypeScript
- shadcn/ui
- Tailwind CSS v4

### Backend

- NestJS
- TypeScript
- PostgreSQL
- Drizzle ORM
- Redis
- BullMQ
- Better Auth
- Arcjet
- Stripe

### Processing

- Local worker machine
- FFmpeg
- Self-hosted Whisper
- Gemini
- Optional Python scripts for ML/video-processing tasks

---

## 3. General Principles

### 3.1 Prefer Clarity Over Cleverness

Write code that is easy to understand.

Avoid:

- Overly clever abstractions
- Deeply nested logic
- Unnecessary generic utilities
- Magic behavior
- Hidden side effects

Prefer:

- Explicit names
- Small functions
- Simple control flow
- Clear boundaries
- Predictable behavior

### 3.2 Keep Business Logic Out of UI Components

UI components should display state and trigger actions.

Business rules should live in:

- Backend services
- Shared domain utilities
- Worker pipeline functions
- Database transactions

Avoid putting pricing, credit deduction, refund rules, or job state transitions directly in React components.

### 3.3 Make Long-Running Work Asynchronous

Never run heavy work inside a normal API request.

Do not run these directly in request handlers:

- Whisper transcription
- FFmpeg rendering
- Face detection
- Gemini analysis
- Large file cleanup

Use BullMQ jobs instead.

### 3.4 Make Money and Credits Auditable

Anything related to credits or payments must be explicit, transactional, and logged.

Never silently mutate user credits.

Every credit change must create a credit ledger entry.

### 3.5 Validate at Boundaries

Validate all inputs at system boundaries:

- HTTP requests
- File uploads
- Webhooks
- Worker job payloads
- Gemini responses
- FFmpeg metadata
- Environment variables

Do not assume inputs are valid just because they came from your own frontend.

---

## 4. TypeScript Standards

### 4.1 Use TypeScript Strict Mode

The codebase should use strict TypeScript settings.

Recommended settings:

```json
{
  "strict": true,
  "noImplicitAny": true,
  "strictNullChecks": true,
  "noUncheckedIndexedAccess": true
}
```

Avoid using `any`.

If a type is truly unknown, use `unknown` and narrow it.

```ts
function parseWebhookPayload(payload: unknown) {
  if (!isStripeEvent(payload)) {
    throw new Error("Invalid Stripe event payload");
  }

  return payload;
}
```

### 4.2 Prefer Explicit Return Types for Public Functions

Public functions, service methods, API utilities, and worker handlers should have explicit return types.

```ts
async function getUserCreditBalance(userId: string): Promise<number> {
  // ...
}
```

Small local helper functions can infer return types when obvious.

### 4.3 Use Domain-Specific Types

Prefer meaningful domain types over loose strings and numbers.

```ts
type ProjectId = string;
type UserId = string;
type Seconds = number;
type Credits = number;
```

For important state fields, use enums or const maps.

```ts
export const JobStatus = {
  Uploaded: "uploaded",
  WaitingForPayment: "waiting_for_payment",
  Queued: "queued",
  Transcribing: "transcribing",
  Analyzing: "analyzing",
  PreviewReady: "preview_ready",
  WaitingForUserEdits: "waiting_for_user_edits",
  Rendering: "rendering",
  Completed: "completed",
  Failed: "failed",
  Refunded: "refunded",
  Deleted: "deleted",
} as const;

export type JobStatus = (typeof JobStatus)[keyof typeof JobStatus];
```

### 4.4 Avoid Boolean Parameter Traps

Avoid function signatures like this:

```ts
renderClip(projectId, true, false);
```

Prefer named options:

```ts
renderClip(projectId, {
  captionsEnabled: true,
  includeWatermark: false,
});
```

---

## 5. Naming Standards

### 5.1 General Naming

Use clear, descriptive names.

Good:

```ts
calculateRequiredCredits();
refundCreditsForFailedJob();
createClipCandidates();
renderSelectedClips();
```

Bad:

```ts
calc();
doStuff();
process();
handle();
```

`handle` is acceptable only when context is obvious, such as an event handler inside a small component.

### 5.2 File Names

Use kebab-case for file names.

```text
credit-ledger.service.ts
video-upload.controller.ts
render-clips.processor.ts
clip-preview-card.tsx
```

Use PascalCase only for React component files if the project convention prefers it. Pick one convention and apply it consistently.

Recommended for RepurposePro:

```text
clip-preview-card.tsx
upload-dropzone.tsx
billing-summary-card.tsx
```

### 5.3 React Component Names

Use PascalCase for component names.

```tsx
export function ClipPreviewCard() {
  return <div />;
}
```

### 5.4 Database Names

Use snake_case for database tables and columns.

```text
processing_jobs
credit_ledger
uploaded_videos
created_at
updated_at
project_id
```

Use camelCase in TypeScript code.

```ts
const uploadedVideoId = uploadedVideo.id;
```

---

## 6. Project Structure

### 6.1 Recommended Monorepo Structure

Recommended structure:

```text
repurposepro/
  apps/
    web/
    api/
    worker/
  packages/
    db/
    shared/
    config/
  docs/
    project-overview.md
    architecture.md
    code-standards.md
```

### 6.2 apps/web

Next.js frontend.

```text
apps/web/
  app/
  components/
  features/
  hooks/
  lib/
  styles/
```

### 6.3 apps/api

NestJS backend API.

```text
apps/api/
  src/
    modules/
    common/
    config/
    main.ts
```

### 6.4 apps/worker

Background worker process.

```text
apps/worker/
  src/
    processors/
    pipelines/
    services/
    scripts/
    main.ts
```

### 6.5 packages/db

Shared database schema and Drizzle client.

```text
packages/db/
  src/
    schema/
    migrations/
    client.ts
```

### 6.6 packages/shared

Shared types and domain constants.

```text
packages/shared/
  src/
    constants/
    types/
    schemas/
    utils/
```

---

## 7. Frontend Standards

### 7.1 Component Structure

Keep components focused.

A component should usually do one of these:

- Display UI
- Manage a small piece of local state
- Compose smaller components
- Connect a feature to API data

Avoid large components that handle upload logic, billing logic, preview editing, and rendering all at once.

### 7.2 Feature-Based Organization

Group feature-specific code together.

Recommended:

```text
features/
  projects/
  upload/
  billing/
  clips/
  summary/
  preview-editor/
  outputs/
```

Each feature can contain:

```text
components/
hooks/
api.ts
types.ts
utils.ts
```

### 7.3 Server and Client Components

Use Server Components by default.

Use Client Components only when needed for:

- Local interactive state
- Video player controls
- Dragging captions
- Form inputs
- Upload progress
- Live job status polling
- Preview editor interactions

Add `"use client"` only at the smallest reasonable boundary.

### 7.4 Styling

Use Tailwind CSS v4 and shadcn/ui.

RepurposePro uses Tailwind v4's CSS-first configuration model. The frontend should import Tailwind from the global stylesheet and define project tokens with `@theme` or `@theme inline`. Do not create or depend on a `tailwind.config.ts` file for normal theme customization. Add a JavaScript config only when a specific third-party integration requires compatibility.

Recommended global CSS shape:

```css
@import "tailwindcss";

:root {
  --rp-primary: #C4522A;
  --rp-bg: #0B0D12;
}

@theme inline {
  --color-rp-primary: var(--rp-primary);
  --color-rp-bg: var(--rp-bg);
}
```

This makes utilities such as `bg-rp-bg`, `text-rp-primary`, and `border-rp-primary` available without extending a JavaScript theme object.

Prefer:

- CSS-first theme configuration
- Complete, statically detectable utility class names
- Consistent spacing
- Shared design tokens
- Semantic shadcn/ui variables for general component states
- RepurposePro-specific `--color-rp-*`, `--radius-rp-*`, and `--shadow-rp-*` theme variables for product-specific design
- Reusable UI primitives
- Accessible components

Avoid:

- `tailwind.config.ts` for ordinary theme customization
- Dynamically constructing utility class fragments such as `` `bg-${color}-500` ``
- Random one-off colors
- Hardcoded layout hacks
- Inline styles unless values are genuinely runtime-driven, such as caption coordinates or user-controlled font size
- Over-customizing shadcn components without reason

When a utility varies by a known state, map the state to complete class strings:

```ts
const statusClasses = {
  completed: "bg-rp-success-soft text-rp-success",
  failed: "bg-rp-danger-soft text-rp-danger",
  processing: "bg-rp-primary-soft text-rp-primary",
} as const;
```

For monorepo packages that Tailwind does not detect automatically, declare explicit sources with `@source` in the CSS entrypoint instead of maintaining a v3-style `content` array.

### 7.5 Forms

Use schema validation for forms.

Recommended:

- Zod for frontend validation
- Matching backend validation where appropriate

Never trust frontend validation alone.

### 7.6 API Calls

Keep API calls in feature-specific API modules.

Example:

```text
features/clips/api.ts
features/billing/api.ts
features/projects/api.ts
```

Avoid scattering `fetch()` calls throughout UI components.

### 7.7 Preview Editor Standards

The preview editor should use metadata, not generated MP4 files.

Preview state should include:

- Clip start time
- Clip end time
- Caption text
- Caption position
- Caption font size
- Highlighted words
- Captions enabled
- Selected/deleted state

The video preview should use:

- HTML video element
- Source video URL
- Timestamp seeking
- CSS overlays for captions

Final rendering must happen through the backend and worker.

---

## 8. Backend Standards

### 8.1 NestJS Module Boundaries

Use modules by domain.

Recommended modules:

```text
auth
users
projects
uploads
billing
credits
jobs
clips
summary
outputs
webhooks
```

Each module should own its controllers, services, and domain-specific logic.

### 8.2 Controllers Should Be Thin

Controllers should:

- Validate request inputs
- Check authentication/authorization
- Call services
- Return DTOs

Controllers should not:

- Contain business logic
- Build complex queries
- Mutate credits directly
- Run FFmpeg
- Call Whisper
- Call Gemini

### 8.3 Services Own Business Logic

Services should contain business rules.

Examples:

```ts
CreditsService.deductCreditsForProcessing();
CreditsService.refundCreditsForFailedJob();
ProjectsService.createProject();
JobsService.queueAnalysisJob();
ClipsService.updateClipMetadata();
```

### 8.4 Use Transactions for Critical Operations

Use database transactions for operations that must succeed or fail together.

Required transactional operations:

- Credit deduction + ledger entry + job creation
- Credit refund + ledger entry + job status update
- Stripe payment record + credit purchase ledger entry
- Project deletion + file deletion scheduling
- Render output creation + job completion update

### 8.5 Authorization

Every project-scoped API request must verify that the authenticated user owns the project.

Do not trust IDs from the client.

Example rule:

```text
A user can only read, edit, render, download, or delete projects they own.
```

### 8.6 API Response Shape

Use consistent response shapes.

For successful single-resource responses:

```json
{
  "data": {}
}
```

For list responses:

```json
{
  "data": [],
  "pagination": {
    "nextCursor": null
  }
}
```

For errors:

```json
{
  "error": {
    "code": "INSUFFICIENT_CREDITS",
    "message": "You do not have enough credits to process this video."
  }
}
```

### 8.7 Error Codes

Use stable error codes.

Examples:

```text
UNAUTHORIZED
FORBIDDEN
NOT_FOUND
VALIDATION_ERROR
FILE_TOO_LARGE
VIDEO_TOO_LONG
INVALID_VIDEO
INSUFFICIENT_CREDITS
PAYMENT_REQUIRED
JOB_NOT_FOUND
JOB_ALREADY_RUNNING
PROCESSING_FAILED
RENDER_FAILED
WEBHOOK_SIGNATURE_INVALID
```

The frontend should rely on error codes, not message text.

---

## 9. Worker Standards

### 9.1 Worker Jobs Must Be Idempotent Where Possible

A retry should not corrupt data or double-charge users.

Rules:

- Do not deduct credits inside a worker job.
- Do not create duplicate rendered outputs on retry.
- Check current job status before doing work.
- Use deterministic output paths where possible.
- Make cleanup safe to run multiple times.

### 9.2 Worker Job Steps Should Update Progress

Workers should update job progress after major steps.

Example analysis progress:

```text
10% - Preparing video
25% - Extracting audio
45% - Transcribing
65% - Analyzing transcript
80% - Generating crop metadata
95% - Saving previews
100% - Preview ready
```

Example render progress:

```text
10% - Preparing render
30% - Rendering clip 1
50% - Rendering clip 2
70% - Rendering clip 3
90% - Saving outputs
100% - Completed
```

### 9.3 Worker Should Never Trust Job Payloads Blindly

Before processing, the worker should verify:

- Project exists
- User exists
- Uploaded video exists
- File exists on disk or storage
- Job status allows processing
- Project has not expired or been deleted
- Requested clip IDs belong to the project

### 9.4 External Commands

When calling FFmpeg, Whisper, or Python scripts:

- Use safe child process APIs
- Do not concatenate shell commands with user input
- Sanitize file paths
- Use generated internal filenames
- Capture stdout and stderr
- Enforce timeouts when possible
- Store useful error logs

Bad:

```ts
exec(`ffmpeg -i ${userFileName} output.mp4`);
```

Better:

```ts
spawn("ffmpeg", ["-i", inputPath, outputPath]);
```

### 9.5 Temporary Files

Temporary files should:

- Live in a project-specific temp directory
- Use generated names
- Be deleted after successful processing
- Be cleaned by retention jobs
- Never be exposed directly to users

---

## 10. Database Standards

### 10.1 Migrations

All schema changes must use migrations.

Do not manually edit production database schema.

Migration names should be descriptive.

```text
0004_add_credit_ledger.sql
0005_add_clip_candidates.sql
0006_add_rendered_outputs.sql
```

### 10.2 Timestamps

Most tables should include:

```text
created_at
updated_at
```

Tables with deletable files should include:

```text
expires_at
deleted_at
```

### 10.3 Soft Deletes

Use soft deletes for user-visible project records.

Use hard deletes for temporary files after retention expiration.

Recommended:

- Soft delete project metadata
- Hard delete source videos and rendered files after 7 days
- Keep credit ledger and payment records

### 10.4 Money and Credits

Do not use floating point numbers for money.

Use integer cents for money.

```text
amount_cents = 2500
```

Credits can be stored as integers.

```text
credits = 40
```

For partial video minutes, round up.

Example:

```text
10.2 video minutes = 11 credits
```

### 10.5 Database Transactions

Use transactions for:

- Payments
- Credits
- Job creation
- Refunds
- Output creation
- Deletion state changes

A failed transaction should leave the system in a safe state.

---

## 11. Billing and Stripe Standards

### 11.1 Stripe Webhooks

Webhook handlers must:

- Verify Stripe signature
- Be idempotent
- Store processed event IDs
- Return success for already-processed events
- Never grant credits twice

### 11.2 Credit Packs

Credit packs should be defined in configuration, not hardcoded across the app.

Example:

```ts
export const CreditPacks = {
  starter: {
    name: "Starter",
    priceCents: 1000,
    credits: 40,
  },
  creator: {
    name: "Creator",
    priceCents: 2500,
    credits: 100,
  },
  pro: {
    name: "Pro",
    priceCents: 5000,
    credits: 200,
  },
} as const;
```

### 11.3 Refunds

For normal processing failures, refund credits, not money.

Stripe refunds should be separate administrative actions.

Credit refunds must create ledger entries.

---

## 12. Security Standards

### 12.1 Secrets

Never commit secrets.

Do not commit:

- API keys
- Stripe secret keys
- Webhook secrets
- Database URLs
- Redis URLs
- Better Auth secrets
- Arcjet keys
- Gemini keys

Use environment variables.

### 12.2 File Upload Security

For uploads:

- Enforce max size of 500 MB
- Check MIME type
- Check file extension
- Probe with FFmpeg
- Reject files without audio
- Reject videos longer than the MVP duration limit
- Store files outside public web directories
- Use generated internal filenames

### 12.3 Access Control

Every file, project, clip, summary, and output must be scoped to a user.

A user must never be able to access another user's:

- Projects
- Source videos
- Transcripts
- Clip metadata
- Rendered outputs
- Billing records

### 12.4 Rate Limiting

Use Arcjet for:

- Signup rate limits
- Login abuse protection
- Upload rate limits
- Billing endpoint protection
- Processing endpoint protection
- Render endpoint protection

### 12.5 Logging Sensitive Data

Do not log:

- Full payment payloads unless sanitized
- Secret keys
- Raw authorization headers
- User session tokens
- Private file paths in user-facing logs
- Full video transcripts if not needed

It is acceptable to log internal IDs, job IDs, and high-level failure reasons.

---

## 13. AI and Gemini Standards

### 13.1 Send Transcript, Not Raw Video

For MVP, Gemini should receive timestamped transcript data, not raw video.

This reduces cost and keeps the AI workflow simpler.

### 13.2 Require Structured Output

Gemini responses should be structured JSON.

Always validate Gemini output before saving it.

Use a schema validator such as Zod.

### 13.3 Keep Prompts Versioned

Store prompt versions in code.

Example:

```text
clip-selection.prompt.v1.ts
summary-selection.prompt.v1.ts
```

Save the prompt version used for each job.

This makes it easier to debug why certain clips were selected.

### 13.4 Validate AI Timestamps

Do not blindly trust AI-generated timestamps.

Validate that:

- Start time is greater than or equal to 0
- End time is after start time
- End time is within video duration
- Clip duration is reasonable
- Summary segments do not exceed expected duration too much

### 13.5 Handle Invalid AI Output

If Gemini returns invalid JSON or unusable timestamps:

1. Retry with a repair prompt.
2. Retry the model call if needed.
3. Fail the job gracefully if still invalid.
4. Refund credits if no preview result can be produced.

---

## 14. FFmpeg Standards

### 14.1 Use FFmpeg for Final Rendering Only

Use browser previews for editing.

Use FFmpeg when the user clicks Render or Export.

### 14.2 Use Deterministic Output Paths

Output paths should be generated from internal IDs.

Example:

```text
renders/clips/clip_<clipId>.mp4
renders/summary/summary_<projectId>.mp4
```

Avoid using original user filenames for internal paths.

### 14.3 Capture Render Logs

For failed renders, capture:

- FFmpeg command arguments without secrets
- Exit code
- stderr
- Input metadata
- Output path

Do not expose raw technical logs directly to users.

### 14.4 Captions

For styled captions, prefer ASS subtitles.

ASS is better than SRT for:

- Positioning
- Font size
- Styling
- Keyword highlighting
- Hormozi-style captions

---

## 15. Testing Standards

### 15.1 What to Test First

Prioritize tests for:

- Credit deduction
- Credit refund
- Stripe webhook idempotency
- Job state transitions
- Project ownership authorization
- Upload validation
- Gemini response validation
- Clip timestamp validation
- Render job creation

### 15.2 Unit Tests

Use unit tests for pure business logic.

Examples:

- Calculate required credits
- Validate clip duration
- Validate summary segment order
- Parse Gemini output
- Determine refund eligibility
- Generate storage paths

### 15.3 Integration Tests

Use integration tests for:

- Credit ledger transactions
- Stripe webhook handling
- Project creation
- Upload metadata creation
- Job queue creation
- Clip metadata updates

### 15.4 End-to-End Tests

E2E tests should cover the critical user path:

1. Sign up
2. Buy credits in test mode
3. Upload video
4. Start processing
5. Receive preview metadata
6. Edit clip metadata
7. Render clip
8. Download output

Mock heavy services where appropriate.

### 15.5 Worker Tests

Worker tests should verify:

- Invalid job payload handling
- Missing file handling
- Whisper failure handling
- Gemini invalid JSON handling
- FFmpeg failure handling
- Credit refund trigger behavior
- Idempotent retry behavior

---

## 16. Error Handling Standards

### 16.1 User-Facing Errors

User-facing errors should be clear and non-technical.

Good:

```text
We couldn't process this video because it does not contain an audio track.
```

Bad:

```text
FFmpeg exited with code 1: stream #0:1 not found.
```

### 16.2 Internal Errors

Internal errors should include enough context for debugging.

Include:

- User ID
- Project ID
- Job ID
- Step name
- Error code
- Stack trace if available
- Relevant metadata

Do not include secrets.

### 16.3 Fail Safely

When in doubt:

- Mark the job failed
- Store the error reason
- Refund credits if the user received no usable result
- Show a clear message
- Avoid corrupting project state

---

## 17. Logging Standards

### 17.1 Log Important Events

Log:

- Upload started/completed
- Credit purchase completed
- Credits deducted
- Credits refunded
- Job queued
- Transcription started/completed
- Gemini analysis started/completed
- Preview ready
- Render started/completed
- Job failed
- Files deleted

### 17.2 Use Structured Logs

Prefer structured logs over plain strings.

Example:

```ts
logger.info("credits_deducted", {
  userId,
  projectId,
  jobId,
  credits,
});
```

---

## 18. Environment and Config Standards

### 18.1 Validate Environment Variables

Validate required environment variables at startup.

Required variables may include:

```text
DATABASE_URL
REDIS_URL
BETTER_AUTH_SECRET
BETTER_AUTH_URL
ARCJET_KEY
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
GEMINI_API_KEY
STORAGE_ROOT
WORKER_INTERNAL_TOKEN
APP_URL
API_URL
MAX_UPLOAD_SIZE_MB
MAX_VIDEO_DURATION_SECONDS
FILE_RETENTION_DAYS
```

Fail fast if required config is missing.

### 18.2 Do Not Hardcode Environment-Specific Values

Avoid hardcoding:

- API URLs
- Storage paths
- Stripe price IDs
- Upload limits
- Retention days
- Redis URLs
- Model names

Use config.

---

## 19. Git Standards

### 19.1 Branch Naming

Use descriptive branch names.

Examples:

```text
feature/upload-flow
feature/credit-ledger
feature/clip-preview-editor
fix/stripe-webhook-idempotency
chore/update-drizzle-schema
```

### 19.2 Commit Messages

Use clear commit messages.

Recommended format:

```text
type(scope): description
```

Examples:

```text
feat(upload): add video metadata probing
feat(billing): add credit ledger transaction
fix(worker): prevent duplicate render outputs on retry
chore(db): add clip candidates migration
```

Common types:

```text
feat
fix
chore
docs
refactor
test
perf
```

### 19.3 Pull Requests

Each pull request should include:

- Summary of changes
- Screenshots for UI changes
- Test notes
- Migration notes if applicable
- Known limitations

Keep pull requests focused.

---

## 20. Documentation Standards

Update documentation when changing:

- Architecture
- API endpoints
- Database schema
- Credit rules
- Payment behavior
- Worker pipeline
- Job states
- File retention behavior
- AI prompts
- Environment variables

Important docs:

```text
docs/project-overview.md
docs/architecture.md
docs/code-standards.md
```

---

## 21. MVP-Specific Rules

For the MVP, keep the scope intentionally narrow.

Do not build:

- YouTube import
- Multi-language transcription
- Advanced timeline editor
- Dynamic active-speaker crop
- Multiple caption templates
- Brand kits
- Team accounts
- Direct social publishing
- AI voiceover
- B-roll generation
- Music and sound effects

Build first:

- Auth
- Upload
- Credits
- Queue
- Transcription
- AI metadata
- Preview editor
- Final render
- Downloads
- Refunds
- Cleanup

---

## 22. Definition of Done

A feature is done when:

- It follows these standards
- It has clear types
- It validates inputs
- It handles errors
- It respects authorization
- It has tests for critical logic
- It does not leak secrets
- It does not block API requests with heavy work
- It updates relevant documentation
- It works in the MVP user flow

---

## 23. Final Rule

RepurposePro is a video-processing product, but the MVP should not become a full video editor.

When making implementation decisions, prefer:

```text
metadata first, render later
```

This keeps the app faster, cheaper, and easier to build.
