# RepurposePro Build Plan

## 1. Purpose

This document defines the implementation plan for **RepurposePro**.

RepurposePro is an AI-powered video repurposing app for podcasters and YouTubers. It turns long-form videos into:

- Short vertical clips
- Condensed summary videos

The MVP follows this workflow:

```text
Sign up
-> Create project
-> Upload video
-> Calculate credit cost
-> Pay/use credits
-> Queue processing
-> Transcribe with Whisper
-> Analyze transcript with Gemini
-> Generate preview metadata
-> Review and edit previews
-> Render final MP4s with FFmpeg
-> Download outputs
```

Core implementation principle:

```text
metadata first, render later
```

The app should not render final MP4 files until the user confirms the preview metadata.

---

## 2. MVP Scope

The MVP includes:

- User authentication
- Local video upload only
- Maximum file size: 500 MB
- Maximum MVP duration: 30 minutes
- English-only support
- Pay-per-video-minute credit system
- Stripe credit purchases
- Credit deduction before processing
- Automatic credit refund on failed processing
- Background job processing
- Redis + BullMQ queues
- Local worker machine
- Self-hosted Whisper transcription
- Gemini transcript analysis
- 5–10 short clip candidates
- Summary video generation
- Preview-before-render flow
- Simple metadata editor
- Face-aware vertical crop
- Center-crop fallback
- Hormozi-style captions by default
- Caption on/off
- Caption text editing
- Caption position editing
- Caption font size editing
- Automatic keyword highlighting
- Final FFmpeg rendering
- MP4 downloads
- Manual file deletion
- Automatic file deletion after 7 days

---

## 3. Deferred Features

Do not build these in the MVP:

- YouTube URL import
- Full 1–2 hour processing
- Multi-language support
- Dynamic active-speaker crop
- Advanced timeline editor
- Multiple templates
- Brand kits
- Team accounts
- AI voiceover
- B-roll generation
- Music and sound effects
- Direct social publishing
- Mobile-first editor
- Multi-track editing
- Drag-and-drop video composition

---

## 4. Recommended Repository Structure

Use a monorepo.

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
    library-docs.md
    ui-tokens.md
    ui-rules.md
    ui-registry.md
    build-plan.md
```

Recommended tooling:

```text
pnpm workspaces
Turborepo, optional
TypeScript
ESLint
Prettier
```

---

## 5. Phase Overview

Recommended phases:

```text
Phase 0  Foundation
Phase 1  Auth and App Shell
Phase 2  Projects and Upload
Phase 3  Billing and Credits
Phase 4  Queue and Worker
Phase 5  Transcription
Phase 6  AI Clip Generation
Phase 7  Clip Preview Editor
Phase 8  Final Clip Rendering
Phase 9  Summary Video
Phase 10 File Retention and Cleanup
Phase 11 Reliability and Security
Phase 12 Testing and Demo Polish
```

---

# Phase 0 — Foundation

## Goal

Create the project structure, shared configuration, design system foundation, and development environment.

## Tasks

### Repository

- Create monorepo.
- Add `apps/web`.
- Add `apps/api`.
- Add `apps/worker`.
- Add `packages/db`.
- Add `packages/shared`.
- Add `packages/config`.

### Frontend

Set up:

- Next.js
- TypeScript
- Tailwind CSS v4
- shadcn/ui
- Lucide icons

### Backend

Set up:

- NestJS
- Environment configuration
- Validation
- Structured logging

### Database

Set up:

- PostgreSQL
- Drizzle ORM
- Drizzle migrations

### Shared config

Add:

- Shared TypeScript config
- Shared ESLint config
- Environment schema
- Shared domain constants
- Shared job-status types

### Docs

Add project docs under:

```text
docs/
```

## Deliverables

- Monorepo runs locally.
- Web app starts.
- API starts.
- Worker process starts.
- Database connection works.
- Redis connection works.
- Tailwind v4 design tokens work.
- Basic CI checks pass.

## Acceptance Criteria

```text
pnpm dev
```

should start the required development services or clearly document separate commands.

---

# Phase 1 — Auth and App Shell

## Goal

Create authentication and the protected app shell.

## Tasks

### Better Auth

Implement:

- Signup
- Login
- Logout
- Session handling
- Protected routes

Optional:

- Password reset
- Google OAuth

For MVP, email/password is enough.

### App shell

Build:

- `AppSidebar`
- `AppTopbar`
- `PageHeader`
- User menu
- Credit balance placeholder

### Screens

Build:

- Login
- Signup
- Dashboard empty state
- Settings shell

### Security

Ensure:

- Protected routes require auth.
- API requests validate session.
- User ID comes from auth context, not request body.

## Deliverables

- User can sign up.
- User can log in.
- User can log out.
- Protected dashboard works.
- Unauthenticated users are redirected.

## Acceptance Criteria

A user cannot access another authenticated user's data by changing IDs in the URL or request payload.

---

# Phase 2 — Projects and Upload

## Goal

Let users create a project and upload a valid source video.

## Tasks

### Database tables

Create:

```text
projects
uploaded_videos
processing_jobs
```

### Project creation

Build:

- `NewProjectForm`
- `OutputTypeSelector`

Output types:

```text
clips
summary
```

### Upload UI

Build:

- `UploadDropzone`
- `UploadProgressCard`
- `VideoMetadataCard`

### Upload backend

Implement:

- Multipart upload handling
- File size validation
- MIME validation
- Secure internal filenames
- Project ownership checks

### ffprobe

Probe:

- Duration
- Width
- Height
- FPS
- Codec
- Audio presence

Reject:

- File over 500 MB
- Video over 30 minutes
- Missing audio
- Corrupted video
- Unsupported input

### Storage

For MVP, use local or mounted storage.

Recommended layout:

```text
storage/
  users/
    <userId>/
      projects/
        <projectId>/
          source/
          audio/
          transcripts/
          metadata/
          renders/
          temp/
```

## Deliverables

- User creates project.
- User uploads video.
- File is validated.
- Metadata is stored.
- Required credits are calculated.

## Acceptance Criteria

The app rejects:

- Oversized files
- Over-duration videos
- Corrupt videos
- Videos without audio

with clear user-facing errors.

---

# Phase 3 — Billing and Credits

## Goal

Implement the pay-per-video-minute business model.

## Pricing

Recommended MVP:

```text
1 credit = 1 video minute
```

Round partial minutes up.

Example:

```text
10.2 minutes = 11 credits
```

Recommended packs:

| Pack | Price | Credits |
|---|---:|---:|
| Starter | $10 | 40 |
| Creator | $25 | 100 |
| Pro | $50 | 200 |

## Tasks

### Database tables

Create:

```text
credit_ledger
stripe_customers
stripe_payments
```

### Credit ledger

Support transaction types:

```text
purchase
processing_deduction
refund
manual_adjustment
expiration_adjustment
```

### Stripe

Implement:

- Stripe Checkout session creation
- Credit-pack products/prices
- Webhook verification
- Webhook idempotency
- Payment persistence
- Credit grant after payment confirmation

### Billing UI

Build:

- `CreditBalanceCard`
- `CreditPackCard`
- `CreditCostSummary`
- `CreditLedgerTable`

### Processing deduction

Before analysis starts:

1. Calculate required credits.
2. Check balance.
3. Open DB transaction.
4. Deduct credits.
5. Write ledger entry.
6. Create processing job.
7. Queue job.

## Deliverables

- User can buy credits.
- User sees balance.
- Credits are deducted before processing.
- Failed processing can be refunded.

## Acceptance Criteria

The system must never:

- Grant credits twice from duplicate Stripe events.
- Deduct credits twice for one processing job.
- Lose ledger history.

---

# Phase 4 — Queue and Worker

## Goal

Move long-running work out of HTTP requests.

## Tasks

### Redis

Set up Redis connection.

### BullMQ queues

Create:

```text
video-analysis-queue
video-render-queue
cleanup-queue
```

### Job types

Implement:

```text
analyze_video
render_clips
render_summary
regenerate_clip_candidate
cleanup_expired_project_files
```

### Worker process

Create local worker app.

Recommended approach:

```text
Node/NestJS worker for BullMQ orchestration
Python subprocesses for Whisper or ML tasks when useful
FFmpeg via spawn()
```

### Job progress

Store:

- Status
- Current step
- Progress percentage, when meaningful
- Error code
- Error message
- Started/completed timestamps

## Deliverables

- API queues jobs.
- Worker receives jobs.
- Worker updates job status.
- API remains responsive during processing.

## Acceptance Criteria

No transcription, Gemini analysis, or FFmpeg rendering runs inside a normal HTTP request handler.

---

# Phase 5 — Transcription

## Goal

Convert uploaded video audio into a timestamped English transcript.

## Tasks

### Audio extraction

Use FFmpeg to extract:

```text
mono
16 kHz
WAV
```

### Whisper

Use self-hosted Whisper.

Prefer:

```text
faster-whisper
```

if it performs well on the local machine.

### Output

Store:

- Full transcript
- Segment timestamps
- Word timestamps if feasible
- Language
- Confidence, if available

### Database tables

Create:

```text
transcripts
transcript_segments
```

### Validation

Fail if:

- Transcription returns empty output.
- Language is unsupported.
- Worker crashes.
- Audio cannot be extracted.

## Deliverables

- A valid video produces a timestamped transcript.
- Transcript is persisted.
- Job progress updates during transcription.

## Acceptance Criteria

A 30-minute English talking-head video can be transcribed without blocking the API.

---

# Phase 6 — AI Clip Generation

## Goal

Use Gemini to select 5–10 high-quality short-form clip candidates.

## Tasks

### Prompting

Create versioned prompts:

```text
clip-selection.prompt.v1.ts
clip-regeneration.prompt.v1.ts
```

### Model strategy

Recommended:

```text
Gemini Flash-Lite for initial scoring
Gemini Flash for final ranking when needed
```

### Input

Send timestamped transcript, not raw video.

### Selection criteria

Optimize for:

- Strong hook
- Emotional reaction
- Useful insight
- Standalone context
- Clean start
- Clean ending
- Low filler

### Output

Require structured JSON.

Example:

```json
{
  "clips": [
    {
      "title": "Why Most Creators Burn Out",
      "startTime": 412.5,
      "endTime": 486.2,
      "score": 92,
      "reason": "Strong hook, useful insight, and clear emotional delivery.",
      "captionHighlights": ["burn out", "consistency", "systems"]
    }
  ],
  "backupCandidates": []
}
```

### Validation

Validate:

- Valid JSON
- Valid timestamps
- End > start
- Within source duration
- Reasonable duration
- No near-duplicate clips
- 5–10 primary clips when possible

### Database table

Create:

```text
clip_candidates
```

## Deliverables

- Gemini returns clip candidates.
- Candidates are validated.
- Backup candidates are stored.
- Preview-ready state is reached.

## Acceptance Criteria

Users can inspect 5–10 candidate clips without any final MP4 rendering having occurred.

---

# Phase 7 — Face-Aware Crop and Clip Preview Editor

## Goal

Let users preview and edit clips before final rendering.

## Tasks

### Face-aware crop

Implement MVP face-aware crop metadata.

Suggested flow:

1. Sample frames.
2. Detect faces.
3. Estimate stable 9:16 crop.
4. Smooth crop positions.
5. Save crop metadata.
6. Fall back to center crop.

Do not implement dynamic active-speaker switching.

### Clip editor UI

Build:

- `ClipPreviewEditor`
- `ClipList`
- `ClipListItem`
- `ClipPreviewPlayer`
- `VerticalCropPreview`
- `CaptionOverlay`
- `CaptionEditor`
- `CaptionTextEditor`
- `CaptionPositionControl`
- `CaptionFontSizeControl`
- `KeywordHighlightEditor`
- `TrimControls`
- `RegenerateClipButton`
- `AIReasonCard`

### Preview behavior

Use:

- Source video URL
- Start/end timestamps
- HTML video player
- CSS crop simulation
- CSS caption overlays

### Editable metadata

Allow:

- Start time
- End time
- Captions on/off
- Caption text
- Caption position
- Caption font size
- Highlighted keywords
- Delete/deselect clip

### Regeneration

For one bad clip:

1. Use unused backup candidate first.
2. Avoid new AI call when possible.
3. Do not charge extra in MVP.

## Deliverables

- User can preview selected clips.
- User can edit metadata.
- No final render happens during normal edits.

## Acceptance Criteria

Edits update preview immediately and are persisted before rendering.

---

# Phase 8 — Final Clip Rendering

## Goal

Render selected short clips to final vertical MP4 files.

## Tasks

### Render queue

Create `render_clips` job.

### FFmpeg pipeline

For each selected clip:

1. Read latest saved metadata.
2. Trim source.
3. Apply 9:16 crop.
4. Generate ASS subtitle file if captions enabled.
5. Burn captions.
6. Encode H.264 video.
7. Encode AAC audio.
8. Save MP4.

### Caption rendering

Use ASS subtitles.

Support:

- White text
- Violet keyword highlights
- Dark outline/stroke
- Caption position
- Caption font size

### Output table

Create:

```text
rendered_outputs
```

Store:

- File path
- Filename
- Duration
- File size
- Width
- Height
- Expiration

### UI

Build:

- `RenderActionBar`
- `RenderProgress`
- `RenderClipStatusList`
- `OutputCard`
- `OutputVideoPreview`
- `DownloadButton`

## Deliverables

- Selected clips render as 9:16 MP4s.
- Captions match preview closely.
- User can download outputs.

## Acceptance Criteria

The system renders only selected clips and uses the latest saved metadata.

---

# Phase 9 — Summary Video

## Goal

Generate a condensed chronological summary using original speaker audio.

## Tasks

### Gemini summary prompt

Create:

```text
summary-selection.prompt.v1.ts
```

### Summary rules

- Preserve original order.
- Keep original speaker audio.
- Remove filler.
- Remove repetition.
- Remove weak tangents.
- Target about 10% of original duration.

### Database table

Create:

```text
summary_segments
```

### Summary UI

Build:

- `SummaryPreviewEditor`
- `SummarySegmentList`
- `SummarySegmentCard`
- `SummaryDurationBar`

Allow:

- Preview segment
- Adjust start/end
- Remove segment

Do not allow complex freeform rearrangement in MVP.

### Rendering

Create `render_summary` job.

FFmpeg flow:

1. Trim selected segments.
2. Preserve chronological order.
3. Concatenate.
4. Preserve original audio.
5. Encode final MP4.

## Deliverables

- Summary candidates are generated.
- User previews segment list.
- Final summary MP4 renders.

## Acceptance Criteria

A 30-minute video can produce roughly a 3-minute chronological summary video using original audio.

---

# Phase 10 — File Retention and Cleanup

## Goal

Automatically delete file assets after 7 days.

## Tasks

### Expiration metadata

Ensure file-backed records include:

```text
expires_at
deleted_at
```

### Cleanup queue

Implement:

```text
cleanup_expired_project_files
```

### Cleanup targets

Delete:

- Source video
- Extracted audio
- Temporary files
- Rendered clips
- Summary MP4
- Preview assets, if any

Keep:

- User account
- Payment records
- Credit ledger
- Minimal project/job history

### UI

Build:

- `ExpirationBadge`
- Expiration notices
- Expired output state

## Deliverables

- Expired files are deleted.
- Database metadata is updated.
- Users see expiration clearly.

## Acceptance Criteria

Cleanup can run multiple times safely without crashing or deleting unrelated files.

---

# Phase 11 — Reliability, Security, and Abuse Protection

## Goal

Make the MVP safe and resilient.

## Tasks

### Arcjet

Protect:

```text
POST /signup
POST /login
POST /projects
POST /projects/:projectId/upload
POST /projects/:projectId/analyze
POST /projects/:projectId/render
POST /billing/checkout
```

### Authorization

Every project-scoped request verifies:

```text
authenticated user ID == project.user_id
```

### Upload security

Enforce:

- File-size limit
- Duration limit
- MIME validation
- FFmpeg probing
- Safe internal filenames
- Storage outside public directories

### Worker security

Rules:

- Validate all job payloads.
- Never pass unsanitized user input to shell.
- Use `spawn()` argument arrays.
- Protect internal worker endpoints.
- Do not expose secrets in logs.

### Stripe

Ensure:

- Webhook signature verification
- Event idempotency
- Duplicate-safe processing

### Gemini

Validate all AI output.

### Error handling

Handle explicitly:

- Upload failure
- Invalid video
- Video too long
- Missing audio
- Whisper failure
- Gemini failure
- Invalid Gemini JSON
- Face detection failure
- FFmpeg failure
- Worker crash
- Redis failure
- Storage failure
- Stripe webhook failure
- Insufficient credits

## Deliverables

- Expensive endpoints are protected.
- Cross-user access is blocked.
- Critical operations are idempotent.
- User-facing errors are clear.

---

# Phase 12 — Testing and Demo Polish

## Goal

Prepare RepurposePro for a reliable portfolio demo.

## Unit Tests

Prioritize:

- Credit calculation
- Credit deduction
- Credit refund
- Clip timestamp validation
- Summary segment validation
- Gemini response validation
- Storage path generation
- Refund eligibility

## Integration Tests

Cover:

- Stripe webhook idempotency
- Credit ledger transactions
- Project creation
- Upload metadata
- BullMQ job creation
- Clip metadata edits
- Render output creation

## End-to-End Tests

Critical path:

1. Sign up.
2. Buy credits in Stripe test mode.
3. Create project.
4. Upload valid video.
5. Start processing.
6. Wait for preview.
7. Edit a clip.
8. Render clip.
9. Download MP4.

### Mocking

Mock heavy services in automated tests where appropriate:

- Whisper
- Gemini
- FFmpeg rendering

Keep at least one manual real-processing demo flow.

## Demo polish

Improve:

- Empty states
- Error states
- Processing copy
- Progress indicators
- Responsive dashboard
- Billing UI
- Clip editor spacing
- Final output cards

---

## 6. Database Build Order

Recommended table creation order:

```text
1. Better Auth tables
2. users / app profile data
3. projects
4. uploaded_videos
5. processing_jobs
6. transcripts
7. transcript_segments
8. clip_candidates
9. summary_segments
10. rendered_outputs
11. credit_ledger
12. stripe_customers
13. stripe_payments
```

---

## 7. API Build Order

Recommended API order:

### Projects

```text
POST   /projects
GET    /projects
GET    /projects/:projectId
PATCH  /projects/:projectId
DELETE /projects/:projectId
```

### Uploads

```text
POST   /projects/:projectId/upload
GET    /projects/:projectId/video
DELETE /projects/:projectId/video
```

### Processing

```text
POST   /projects/:projectId/analyze
GET    /projects/:projectId/status
GET    /projects/:projectId/jobs/:jobId/status
```

### Clips

```text
GET    /projects/:projectId/clips
GET    /projects/:projectId/clips/:clipId
PATCH  /projects/:projectId/clips/:clipId
DELETE /projects/:projectId/clips/:clipId
POST   /projects/:projectId/clips/:clipId/regenerate
```

### Summary

```text
GET    /projects/:projectId/summary
PATCH  /projects/:projectId/summary
```

### Render

```text
POST   /projects/:projectId/render
GET    /projects/:projectId/outputs
GET    /projects/:projectId/outputs/:outputId/download
DELETE /projects/:projectId/outputs/:outputId
```

### Billing

```text
GET    /billing/credits
GET    /billing/ledger
POST   /billing/checkout
POST   /billing/webhook
```

---

## 8. UI Screen Build Order

Build screens in this order:

1. Signup
2. Login
3. Dashboard
4. New Project
5. Upload Video
6. Payment / Credits
7. Processing Status
8. Clip Preview Editor
9. Render Status
10. Outputs / Download
11. Billing
12. Summary Preview Editor
13. Settings
14. Error / Refund States

---

## 9. UI Component Build Order

Build components in this order:

1. Button
2. Input
3. Card
4. Badge
5. Dialog
6. Progress
7. AppSidebar
8. AppTopbar
9. PageHeader
10. StatusBadge
11. ProjectCard
12. UploadDropzone
13. VideoMetadataCard
14. CreditBalanceCard
15. CreditPackCard
16. CreditCostSummary
17. ProcessingProgress
18. ProcessingStepList
19. ClipList
20. ClipListItem
21. ClipPreviewPlayer
22. CaptionOverlay
23. CaptionEditor
24. TrimControls
25. RegenerateClipButton
26. RenderProgress
27. OutputCard
28. CreditLedgerTable
29. SummarySegmentCard
30. SummaryDurationBar

---

## 10. Suggested Milestones

## Milestone 1 — Product Shell

Done when:

- Auth works.
- Dashboard works.
- Project creation works.
- Upload UI works.

## Milestone 2 — Paid Processing Entry

Done when:

- Video metadata is probed.
- Credit cost is calculated.
- Stripe test-mode purchase works.
- Credits are deducted safely.

## Milestone 3 — Background Pipeline

Done when:

- BullMQ is running.
- Worker receives jobs.
- Whisper transcription works.
- Job progress updates.

## Milestone 4 — AI Preview

Done when:

- Gemini selects clips.
- Backup candidates are stored.
- Clip preview editor shows metadata previews.

## Milestone 5 — Final Clip Output

Done when:

- User edits clip metadata.
- FFmpeg renders vertical clips.
- ASS captions work.
- MP4 downloads work.

## Milestone 6 — Summary Video

Done when:

- Gemini selects chronological summary segments.
- User can preview/edit segments.
- FFmpeg renders summary MP4.

## Milestone 7 — MVP Hardening

Done when:

- Credits refund on failure.
- Files auto-delete after 7 days.
- Arcjet protects expensive endpoints.
- Critical tests pass.
- Demo flow is polished.

---

## 11. Risk Register

## Risk 1 — Whisper Performance

Problem:

Self-hosted transcription can be slow on a local machine.

Mitigation:

- Limit videos to 30 minutes.
- Use one analysis worker at a time.
- Consider `faster-whisper`.
- Use GPU later.

---

## Risk 2 — Caption Timing Quality

Problem:

Segment timestamps may feel too coarse.

Mitigation:

- Prefer word-level timestamps if practical.
- Allow caption text editing.
- Group words into readable caption chunks.

---

## Risk 3 — Face-Aware Crop Instability

Problem:

Crop may jump between positions.

Mitigation:

- Sample fewer frames.
- Smooth coordinates.
- Prefer stable crop over constant movement.
- Fall back to center crop.

---

## Risk 4 — AI Clip Quality

Problem:

Gemini may pick weak or overlapping clips.

Mitigation:

- Validate duration.
- Remove near-duplicates.
- Store backup candidates.
- Show AI reason.
- Allow regeneration.

---

## Risk 5 — Rendering Time

Problem:

Rendering many clips can be slow.

Mitigation:

- Render only selected clips.
- Queue rendering.
- Limit concurrency.
- Avoid re-rendering on every edit.

---

## Risk 6 — Billing Edge Cases

Problem:

Duplicate webhooks or failed jobs may corrupt credits.

Mitigation:

- Immutable ledger.
- Idempotent Stripe events.
- Database transactions.
- Separate payment records from credit balance.

---

## Risk 7 — Scope Creep

Problem:

RepurposePro may turn into a full video editor.

Mitigation:

Keep the MVP editor limited to:

```text
preview
trim
captions
delete
regenerate
render
download
```

---

## 12. Definition of Done for MVP

RepurposePro MVP is done when a user can:

1. Create an account.
2. Buy credits.
3. Create a project.
4. Upload an English video under 30 minutes and 500 MB.
5. Pay for processing with credits.
6. Leave the page while processing continues.
7. Receive 5–10 AI-generated clip previews or a summary preview.
8. Edit clip metadata.
9. Render selected clips or a summary video.
10. Download final MP4 files.
11. Receive automatic credit refund if processing fails.
12. See that files expire after 7 days.

---

## 13. Portfolio Demo Script

Recommended demo flow:

1. Open RepurposePro landing page.
2. Sign in.
3. Show dashboard and credit balance.
4. Create a short-clips project.
5. Upload a podcast/talking-head video.
6. Show detected duration and required credits.
7. Start processing.
8. Show processing pipeline:
   - Transcribing
   - Analyzing
   - Preview ready
9. Open clip editor.
10. Show 5–10 AI-selected clips.
11. Preview one clip.
12. Change trim.
13. Edit caption text.
14. Move caption position.
15. Change font size.
16. Regenerate one bad clip.
17. Render selected clips.
18. Show render progress.
19. Download final MP4.
20. Show billing ledger and credit deduction.

Optional second demo:

- Create summary project.
- Generate chronological summary.
- Render final summary MP4.

---

## 14. Final Build Rule

Whenever implementation choices become unclear, prefer the option that keeps RepurposePro:

```text
simpler
cheaper
more reliable
easier to demo
easier to maintain
```

The MVP should prove one thing extremely well:

```text
RepurposePro can turn one long creator video into useful short-form content with minimal editing effort.
```
