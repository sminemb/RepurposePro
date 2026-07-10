# AGENTS.md

## 1. Purpose

This file defines how coding agents must work on **RepurposePro**.

It is the top-level operational guide for autonomous or semi-autonomous coding work.

Agents must use this file together with:

```text
project-overview.md
architecture.md
code-standards.md
library-docs.md
ui-tokens.md
ui-rules.md
ui-registry.md
build-plan.md
progress-tracker.md
api-contracts.md
database-schema.md
env-reference.md
```

The goal is to ensure that any coding agent can:

- Understand the product
- Follow the agreed architecture
- Build in vertical slices
- Avoid duplicate or conflicting implementations
- Keep financial operations safe
- Preserve security and ownership rules
- Verify work before marking it complete
- Leave a reliable handoff for the next agent

---

## 2. Product Summary

RepurposePro is an AI-powered web app for podcasters and YouTubers.

It turns long-form talking-head or podcast videos into:

- 5–10 short vertical clips
- A condensed chronological summary video

Core user journey:

```text
Sign up
-> Create project
-> Upload video
-> See credit cost
-> Buy/use credits
-> Start processing
-> Transcribe
-> Analyze transcript
-> Preview AI-selected clips or summary segments
-> Edit metadata
-> Render final MP4
-> Download
```

Core product principle:

```text
metadata first, render later
```

Do not render final MP4 files during ordinary preview edits.

Final rendering begins only after explicit user action.

---

## 3. Mandatory Reading Order

Before changing code, read the relevant docs in this order.

### Always read first

```text
1. AGENTS.md
2. project-overview.md
3. progress-tracker.md
4. build-plan.md
```

### Then read based on the task

Architecture or infrastructure:

```text
architecture.md
library-docs.md
env-reference.md
```

Database work:

```text
database-schema.md
api-contracts.md
```

Frontend/UI work:

```text
ui-tokens.md
ui-rules.md
ui-registry.md
code-standards.md
```

Backend/API work:

```text
api-contracts.md
database-schema.md
code-standards.md
```

Billing work:

```text
api-contracts.md
database-schema.md
architecture.md
```

AI/worker/render work:

```text
architecture.md
library-docs.md
database-schema.md
progress-tracker.md
```

Do not start implementation before identifying the current vertical slice and task.

---

## 4. Source of Truth Hierarchy

When docs disagree, use this precedence order:

```text
1. Explicit user instruction in current task
2. AGENTS.md
3. progress-tracker.md
4. build-plan.md
5. api-contracts.md
6. database-schema.md
7. architecture.md
8. code-standards.md
9. ui-rules.md
10. ui-registry.md
11. ui-tokens.md
12. library-docs.md
13. project-overview.md
```

If a conflict remains:

- Prefer the more specific rule.
- Prefer the more recent vertical-slice decision.
- Record the decision in `progress-tracker.md`.
- Do not silently invent a new architecture.

---

## 5. Vertical Slice Rule

Agents must build by **vertical slice**, not by technical layer.

Bad:

```text
Build all database tables
Build all APIs
Build all UI
Build all workers
```

Good:

```text
User uploads a video
-> UI accepts file
-> API validates it
-> storage saves it
-> ffprobe extracts metadata
-> DB stores metadata
-> UI shows duration and credit cost
```

Each completed slice must produce a usable user outcome.

---

## 6. Vertical Slice Order

Use this execution order unless blocked or explicitly instructed otherwise:

```text
VS0  Repo boots and core infrastructure is ready
VS1  User can sign up, log in, and see protected dashboard
VS2  User can create a project and upload a validated video
VS3  User can buy credits and start a paid processing job
VS4  User receives AI-generated clip previews
VS5  User can edit one clip preview before rendering
VS6  User can render and download one final vertical MP4 clip
VS7  User can manage multiple clips and regenerate a bad one
VS8  User can generate, edit, render, and download a summary video
VS9  Failed processing automatically refunds credits
VS10 Files expire and are deleted after 7 days
VS11 Security, abuse protection, and reliability are hardened
VS12 Full MVP is tested, responsive, and demo-ready
```

The first major product milestone is:

```text
VS6
```

By VS6, the complete core journey must work:

```text
sign up
-> upload
-> pay
-> process
-> preview
-> edit
-> render
-> download
```

---

## 7. Progress Tracker Is Mandatory

Before starting a task, update:

```text
progress-tracker.md
```

Record:

- Current slice
- Current task
- Status
- Start date
- Start time

Timezone:

```text
Asia/Manila
```

Date format:

```text
YYYY-MM-DD
```

Time format:

```text
HH:mm
```

After completing the task, record:

- End date
- End time
- Files changed
- Commands run
- Tests
- Verification results
- Known limitations
- Blockers
- Next recommended task

Do not mark a task complete without updating the tracker.

---

## 8. Required Task Workflow

For every task:

### Step 1 — Read

Read:

```text
AGENTS.md
progress-tracker.md
relevant domain docs
```

### Step 2 — Inspect

Inspect existing code before creating new abstractions.

Look for:

- Existing components
- Existing API patterns
- Existing schemas
- Existing validators
- Existing services
- Existing tests
- Existing utility functions

Do not create duplicates.

### Step 3 — Mark task started

Update:

```text
progress-tracker.md
```

Set:

```text
Status: IN_PROGRESS
Start Date:
Start Time:
```

### Step 4 — Implement smallest complete slice

Prefer the smallest change that completes the user outcome.

Do not overbuild.

### Step 5 — Verify

Run the relevant checks.

Examples:

```text
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
```

Also verify manually when appropriate.

### Step 6 — Update tracker

Record:

- End timestamp
- Files changed
- Commands run
- Results
- Limitations
- Next task

### Step 7 — Handoff

Update the handoff section before stopping.

---

## 9. Technology Stack

Frontend:

```text
Next.js
React
TypeScript
Tailwind CSS v4
shadcn/ui
Lucide icons
```

Backend:

```text
NestJS
PostgreSQL
Drizzle ORM
Redis
BullMQ
Better Auth
Arcjet
Stripe
```

Processing:

```text
Local worker machine
Self-hosted Whisper
Gemini
FFmpeg
ffprobe
ASS subtitles
Face detection
```

---

## 10. Tailwind CSS v4 Rule

This project uses:

```text
Tailwind CSS v4
```

Do not use Tailwind v3 configuration patterns unless required by a specific compatibility need.

Preferred approach:

```css
@import "tailwindcss";

@theme inline {
  --color-rp-primary: var(--rp-primary);
}
```

Do not rely on legacy `theme.extend` patterns as the default architecture.

Use static class names where possible.

Avoid runtime-generated utility strings that Tailwind cannot detect.

Bad:

```ts
`bg-${color}-500`
```

Good:

```ts
const variants = {
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
};
```

---

## 11. Frontend Rules

Use:

```text
components/ui/
```

for low-level shadcn primitives.

Use:

```text
components/app/
```

for shared RepurposePro app components.

Use:

```text
features/<feature>/components/
```

for feature-specific components.

Do not put product business logic into primitive components.

Examples:

Good:

```text
features/clips/components/clip-preview-editor.tsx
features/billing/components/credit-pack-card.tsx
```

Bad:

```text
components/ui/video-ai-billing-editor.tsx
```

---

## 12. UI Rules

Follow:

```text
ui-tokens.md
ui-rules.md
ui-registry.md
```

Core UI direction:

```text
premium
dark-tech
creator-focused
cinematic
clean
trustworthy
violet signal accent
```

Primary brand palette:

```text
Charcoal  #0B0D12
Slate     #1A1D25
Violet    #7B61FF
Mist      #B9BDCF
White     #F5F6F8
Black     #050608
```

Do not introduce new visual systems without updating the UI docs.

---


## 14. Responsive Design Rules

Required responsive behavior:

```text
Dashboard: responsive
Upload: responsive
Billing: responsive
Outputs: responsive
Clip editor: desktop-first
```

For smaller screens, the editor may:

- Collapse panels into tabs
- Use sheets
- Show a larger-screen recommendation

Do not attempt to build a full mobile professional video editor for MVP.

---

## 15. API Rules

Follow:

```text
api-contracts.md
```

Use stable response shapes.

Success:

```json
{
  "data": {}
}
```

Error:

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

Do not expose:

- Stack traces
- SQL
- Raw filesystem paths
- Secrets
- Internal queue implementation details

---

## 16. Authentication and Ownership Rules

All protected requests must derive user identity from the authenticated server-side session.

Never trust:

```text
userId
ownerId
accountId
```

from request bodies for authorization.

Every project-scoped resource must be authorized through the project owner.

Required pattern:

```text
project.user_id == authenticated_user.id
```

For child resources:

```text
clip
output
video
job
summary segment
```

authorize through project ownership.

Do not authorize only by child ID.

---

## 17. Database Rules

Follow:

```text
database-schema.md
```

PostgreSQL is the durable source of truth.

Redis is not durable truth.

Use:

```text
snake_case columns
plural table names
UTC timestamps
opaque IDs
```

Never edit an already-applied production migration.

Create a new migration.

---

## 18. Credit Ledger Rules

Credits are financial state.

Use an immutable ledger.

Never store only:

```text
balance = 42
```

as the sole source of truth.

Authoritative balance:

```text
SUM(credit_ledger.amount)
```

Critical invariants:

```text
Every credit movement creates one immutable ledger row.
The worker never deducts credits.
A processing job cannot receive more than one automatic refund.
Duplicate Stripe events cannot duplicate credits.
```

---

## 19. Pricing Rules

MVP pricing:

```text
$0.25 per video minute
1 credit = 1 video minute
partial minutes round up
```

Example:

```text
10.2 minutes -> 11 credits
```

Recommended packs:

```text
Starter  $10 = 40 credits
Creator  $25 = 100 credits
Pro      $50 = 200 credits
```

Do not trust client-provided price or credit amount.

The server must map approved pack code to trusted Stripe price ID and credit amount.

---

## 20. Stripe Rules

Stripe operations must be idempotent.

Required:

- Verify webhook signature
- Persist Stripe event ID
- Prevent duplicate processing
- Prevent duplicate credit grant
- Use trusted server-side pack mapping

Do not grant credits from:

- Query params
- Client-supplied amount
- Client-supplied credit count

---

## 21. Processing Rules

Heavy work must never run inside a normal API request.

Use:

```text
Redis
BullMQ
local worker
```

Queues:

```text
video-analysis-queue
video-render-queue
cleanup-queue
```

Job types:

```text
analyze_video
render_clips
render_summary
regenerate_clip_candidate
cleanup_expired_project_files
```

Recommended MVP concurrency:

```text
analysis: 1
render: 1
cleanup: 1
```

---

## 22. Queue Payload Rules

BullMQ payloads contain IDs only.

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
  "fullVideo": "...",
  "fullTranscript": "...",
  "captions": []
}
```

The worker must load authoritative data from PostgreSQL and storage.

---

## 23. Worker Rules

Before processing a job, the worker must verify:

- Job exists
- Project exists
- Source file exists
- Project/job relationship is valid
- Current state allows operation
- Required metadata exists

Workers should be idempotent where practical.

Retries must not duplicate:

- Credits
- Refunds
- Outputs
- Payment records

---

## 24. Safe Subprocess Execution

Never construct shell commands by concatenating user input.

Bad:

```ts
exec(`ffmpeg -i ${input} ${output}`);
```

Good:

```ts
spawn("ffmpeg", ["-i", inputPath, outputPath]);
```

Always:

- Use argument arrays
- Use internal generated paths
- Validate file existence
- Avoid shell mode
- Sanitize output filenames

---

## 25. Whisper Rules

Whisper is self-hosted on the local worker.

MVP:

```text
English only
```

Prefer:

- Segment timestamps
- Word-level timestamps when feasible

Word timestamps are preferred for captions.

Fallback:

```text
segment/phrase timestamps
```

Do not block MVP solely because word timestamps are unavailable.

---

## 26. Gemini Rules

Do not send raw video to Gemini in MVP.

Send:

```text
timestamped Whisper transcript
```

Recommended model strategy:

```text
Initial candidate scoring: Flash-Lite
Final ranking: Flash
Summary selection: Flash
Regenerate one clip: Flash-Lite first, Flash fallback
```

Model names may change over time.

Verify exact model identifiers at implementation time.

All Gemini responses must be validated with structured schemas.

Never trust raw AI output.

Validate:

- JSON shape
- timestamps
- source duration bounds
- duplicates
- missing fields
- unreasonable durations

---

## 27. Clip Selection Rules

Generate:

```text
5–10 primary clips
backup candidates
```

Selection criteria:

- Strong hook
- Emotional reaction
- Useful insight
- Standalone context
- Clean opening
- Clean ending
- Low filler

Preferred clip duration:

```text
roughly 60–90 seconds
```

Allow natural exceptions when a stronger clip requires a different duration.

---

## 28. Summary Rules

Summary video must:

- Preserve chronological order
- Use original speaker audio
- Remove filler
- Remove repetition
- Remove weak tangents
- Target approximately 10% of source duration

Do not implement freeform segment reordering in MVP.

---

## 29. Preview Rules

Browser preview uses:

- Source video
- Start/end metadata
- CSS crop simulation
- HTML/CSS caption overlay

Do not render final MP4 during ordinary edits.

Editable metadata:

- Start time
- End time
- Captions on/off
- Caption text
- Caption position
- Caption font size
- Highlighted keywords
- Selected/deleted state

---

## 30. Caption Rules

Default style:

```text
Hormozi-style
```

Default direction:

```text
white text
violet highlighted keywords
dark outline
strong legibility
```

Use ASS subtitles for final burn-in.

MVP rules:

- One highlight color
- 1–3 meaningful highlighted words per line
- Keep captions inside safe zones
- Allow text editing
- Allow size editing
- Allow position editing

---

## 31. Face-Aware Crop Rules

MVP crop flow:

```text
sample frames
-> detect faces
-> estimate stable 9:16 crop
-> smooth crop positions
-> store crop metadata
-> center-crop fallback
```

Do not implement dynamic active-speaker switching in MVP.

Prefer stable framing over frequent movement.

---

## 32. Render Rules

Final render happens only after explicit user action.

Use FFmpeg to apply:

- Trim
- 9:16 crop
- Face-aware crop metadata
- Center-crop fallback
- ASS captions
- H.264 video
- AAC audio
- MP4 output

Only render selected clips.

Always use latest persisted metadata.

---

## 33. Regeneration Rules

Regenerating one bad clip:

1. Use unused backup candidate first.
2. Only call Gemini if backup candidates are exhausted.
3. Do not charge extra credits within the same paid MVP project.
4. Replace only the requested clip slot.

Do not regenerate all clips unless explicitly requested.

---

## 34. Refund Rules

Normal processing failures refund credits, not Stripe money.

Refunds must be:

- Automatic when eligible
- Idempotent
- Recorded in immutable ledger

Potential eligible failures:

- Audio extraction failure
- Whisper failure
- Gemini failure after retry policy
- Invalid AI output after retry policy
- FFmpeg failure before usable output
- Worker permanent failure
- Storage failure preventing usable result

Centralize refund eligibility logic.

---

## 35. File Retention Rules

MVP file retention:

```text
7 days
```

Delete after expiration:

- Source videos
- Extracted audio
- Temporary files
- Rendered clips
- Summary videos
- Preview assets if any

Keep:

- User account
- Payment records
- Credit ledger
- Minimal project metadata
- Minimal job history

Cleanup must be idempotent.

---

## 36. Environment Rules

Follow:

```text
env-reference.md
```

Never commit real secrets.

Never expose secrets with:

```text
NEXT_PUBLIC_
```

Never log secret values.

Required categories include:

- Database
- Redis
- Better Auth
- Stripe
- Gemini
- Whisper
- FFmpeg
- Storage
- Arcjet
- Logging
- Tests

All required env variables must be validated at startup.

---

## 37. Testing Rules

At minimum, verify relevant work with:

```text
typecheck
lint
unit tests
integration tests
manual verification
```

Critical domain tests:

- Credit calculation
- Credit deduction
- Credit refund
- Stripe webhook idempotency
- Clip timestamp validation
- Summary segment validation
- Gemini structured-output validation
- Storage path generation
- Refund eligibility

Critical E2E flows:

```text
clips flow
summary flow
```

Heavy services may be mocked in automated tests:

- Gemini
- Whisper
- FFmpeg rendering

Keep at least one real manual processing demo.

---

## 38. Error Handling Rules

User-facing errors must be specific and human-readable.

Good:

```text
We could not process this video because it does not contain an audio track.
```

Bad:

```text
FFmpeg exit code 1.
```

Internal logs may contain technical details.

User responses must not expose sensitive internals.

---

## 39. Logging Rules

Logs should include useful context:

- request ID
- user ID when safe
- project ID
- job ID
- queue job ID
- error code
- processing step
- attempt number

Do not log:

- Passwords
- Auth secrets
- Stripe secrets
- Gemini keys
- Raw payment credentials
- Full session cookies

---

## 40. Rate Limiting and Abuse Protection

Protect at minimum:

```text
signup
login
project creation
upload
analysis start
render start
billing checkout
```

Use Arcjet where defined.

Do not wait until VS11 to write unsafe code.

VS11 is an audit/hardening slice, not permission to defer all security.

---

## 41. Do Not Build Yet

Deferred from MVP:

```text
YouTube URL import
1–2 hour video support
multi-language
dynamic active-speaker crop
advanced timeline editor
multiple templates
brand kits
team accounts
direct social publishing
AI voiceover
B-roll
music/SFX
watermarked free previews
mobile-first full editor
```

Do not add deferred features without explicit approval.

---

## 42. Scope Control Rule

When implementation choices are unclear, prefer the option that is:

```text
simpler
cheaper
more reliable
easier to demo
easier to maintain
```

Do not turn RepurposePro into a full professional video editor.

---

## 43. Definition of Done for a Task

A task is not complete until:

- [ ] Code is implemented.
- [ ] Existing patterns were followed.
- [ ] Types pass.
- [ ] Relevant lint passes.
- [ ] Relevant tests pass or failures are documented.
- [ ] User-facing behavior is verified.
- [ ] Security implications were considered.
- [ ] Files changed are recorded.
- [ ] Commands run are recorded.
- [ ] Start date/time are recorded.
- [ ] End date/time are recorded.
- [ ] Progress tracker is updated.
- [ ] Handoff state is current.

---

## 44. Definition of Done for a Vertical Slice

A vertical slice is not complete until:

- [ ] User-visible outcome works.
- [ ] Required UI exists.
- [ ] Required API exists.
- [ ] Required persistence exists.
- [ ] Required worker behavior exists when applicable.
- [ ] Ownership is enforced.
- [ ] Error states exist.
- [ ] Verification is recorded.
- [ ] Progress tracker is updated.
- [ ] Next agent can continue without guessing.

---

## 45. Handoff Rule

Before ending work, update the handoff section in:

```text
progress-tracker.md
```

Include:

```text
Current Slice
Current Task
Current Status
Last Completed Task
Next Recommended Task
Uncommitted Changes
Known Failing Tests
Known Blockers
Important Context
Required Commands Before Continuing
Last Updated Date
Last Updated Time
Last Updated By
```

Do not leave hidden context only in chat history.

---

## 46. Final Agent Rule

Before coding:

```text
read docs
-> read tracker
-> identify current vertical slice
-> inspect existing code
-> record start timestamp
-> implement smallest complete outcome
-> verify
-> record end timestamp
-> update tracker
-> leave handoff
```

Optimize for completed user outcomes, not completed technical layers.

The project should always remain understandable to the next coding agent.
