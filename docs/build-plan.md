# RepurposePro Build Plan

## 1. Purpose

This document defines the implementation plan for **RepurposePro** using **vertical slices**.

A vertical slice delivers a complete, testable user outcome across every required layer:

```text
UI
-> API
-> Database
-> Queue/Worker
-> External integrations
-> Verification
```

The build plan intentionally avoids organizing delivery as isolated frontend, backend, database, AI, or worker phases. Those horizontal layers are implementation details inside each slice.

Core product flow:

```text
Sign up
-> Create project
-> Upload video
-> See credit cost
-> Buy/use credits
-> Start processing
-> Receive AI-generated preview
-> Edit metadata
-> Render final MP4
-> Download
```

Core engineering principle:

```text
metadata first, render later
```

The canonical coding-agent status file is:

```text
progress-tracker.md
```

Task IDs, slice IDs, execution order, timestamps, blockers, verification, and handoff state should stay synchronized with that tracker.

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
- Automatic credit refund on eligible failed processing
- Background processing with Redis + BullMQ
- Local worker machine
- Self-hosted Whisper transcription
- Gemini transcript analysis
- 5–10 short clip candidates
- Browser preview before final rendering
- Simple metadata editor
- Face-aware vertical crop with center-crop fallback
- Default Hormozi-style captions
- Caption text, position, size, toggle, and keyword-highlight editing
- Final FFmpeg rendering
- MP4 downloads
- Summary-video generation
- Automatic file deletion after 7 days
- Responsive dashboard, upload, billing, and output screens
- Desktop-first editor with smaller-screen fallback

---

## 3. Deferred Features

Do not build these in the first MVP:

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
- Mobile-first full editor
- Multi-track editing
- Drag-and-drop video composition

---

## 4. Recommended Repository Structure

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
    progress-tracker.md
```

Recommended tooling:

```text
pnpm workspaces
TypeScript
Next.js
NestJS
Tailwind CSS v4
shadcn/ui
PostgreSQL
Drizzle ORM
Redis
BullMQ
Better Auth
Arcjet
Stripe
Whisper
Gemini
FFmpeg
ASS subtitles
```

---

## 5. Vertical Slice Overview

| Slice | User Outcome | Dependency |
|---|---|---|
| VS0 | Repo boots and core infrastructure is ready | None |
| VS1 | User can sign up, log in, and see protected dashboard | VS0 |
| VS2 | User can create a project and upload a validated video | VS1 |
| VS3 | User can buy credits and start a paid processing job | VS2 |
| VS4 | User receives AI-generated clip previews from uploaded video | VS3 |
| VS5 | User can edit one clip preview before rendering | VS4 |
| VS6 | User can render and download one final vertical MP4 clip | VS5 |
| VS7 | User can manage multiple clips and regenerate a bad one | VS6 |
| VS8 | User can generate, edit, render, and download a summary video | VS6 |
| VS9 | Failed processing automatically refunds credits and explains why | VS3–VS8 |
| VS10 | Files expire and are deleted after 7 days | VS6 |
| VS11 | Critical security, abuse protection, and reliability are hardened | VS1–VS10 |
| VS12 | Full MVP happy path is tested, responsive, and demo-ready | VS1–VS11 |

---

# VS0 — Repo Boots and Core Infrastructure Is Ready

## User Outcome

A developer can clone the repository, install dependencies, and start the web app, API, worker, PostgreSQL connection, and Redis connection.

This is the only intentionally infrastructure-heavy foundational slice.

## Work Included

- Create monorepo structure.
- Create `apps/web`.
- Create `apps/api`.
- Create `apps/worker`.
- Create `packages/db`, `packages/shared`, and `packages/config`.
- Configure Next.js.
- Configure Tailwind CSS v4 using CSS-first configuration.
- Configure shadcn/ui.
- Configure NestJS.
- Configure PostgreSQL + Drizzle.
- Configure Redis connectivity.
- Add environment validation.
- Add structured logging baseline.
- Add lint, typecheck, test, and startup scripts.

## Acceptance Criteria

- [ ] Web app starts.
- [ ] API starts.
- [ ] Worker starts.
- [ ] PostgreSQL connection succeeds.
- [ ] Redis connection succeeds.
- [ ] Tailwind CSS v4 tokens render correctly.
- [ ] Typecheck passes.
- [ ] Lint passes.

---

# VS1 — User Can Sign Up, Log In, and See Protected Dashboard

## User Outcome

A new user can create an account, log in, see the protected RepurposePro dashboard, and log out.

## Layers Crossed

```text
Web -> Better Auth -> API/session validation -> Database -> Authorization tests
```

## Work Included

- Configure Better Auth end to end.
- Build signup flow.
- Build login flow.
- Build logout flow.
- Persist sessions correctly.
- Create protected dashboard shell.
- Create `AppSidebar`, `AppTopbar`, and `PageHeader`.
- Reject unauthenticated API requests.
- Verify session persistence.

## Acceptance Criteria

- [ ] User can sign up.
- [ ] User can log in.
- [ ] User can log out.
- [ ] Dashboard is protected.
- [ ] API rejects unauthenticated access.
- [ ] Session persists correctly.

---

# VS2 — User Can Create a Project and Upload a Validated Video

## User Outcome

An authenticated user can create a clips or summary project, upload a local video, and see validated metadata and required credits.

## Layers Crossed

```text
Web -> API -> Storage -> ffprobe -> Database -> UI result
```

## Work Included

- Add project schema and CRUD.
- Add uploaded-video schema.
- Enforce project ownership.
- Build new-project UI.
- Build clips/summary output-type selector.
- Build upload dropzone and upload progress.
- Implement secure upload endpoint.
- Generate internal storage paths.
- Probe duration, resolution, FPS, codec, and audio presence with ffprobe.
- Enforce 500 MB file-size limit.
- Enforce 30-minute MVP duration limit.
- Reject missing-audio and corrupted videos.
- Calculate required credits from duration.
- Display validated metadata and credit estimate.

## Acceptance Criteria

- [ ] User creates project.
- [ ] User uploads a local video.
- [ ] App rejects files over 500 MB.
- [ ] App rejects videos over 30 minutes.
- [ ] App rejects corrupted videos and videos without audio.
- [ ] App shows duration and required credits.

---

# VS3 — User Can Buy Credits and Start a Paid Processing Job

## User Outcome

A user can buy credits through Stripe and spend credits to start background processing.

## Layers Crossed

```text
Web -> API -> Stripe -> Webhook -> Database transaction -> Credit ledger -> BullMQ -> Processing state UI
```

## Work Included

- Add credit-ledger schema.
- Add Stripe customer/payment schemas.
- Add a session-scoped credit-balance API and UI.
- Build public credit-pack cards from one catalog with no Stripe price IDs.
- Build credit-cost summary.
- Create Stripe Checkout session.
- Protect Checkout with Arcjet and return standard `429` envelope before shipping it.
- Verify Stripe webhook signatures.
- Make webhook processing idempotent.
- Grant credits only after confirmed payment.
- Expose transaction history only after first webhook-granted purchase exists.
- Deduct credits before processing.
- Create processing job inside safe transaction boundaries.
- Enqueue analysis job in BullMQ.
- Show queued status.

## Acceptance Criteria

- [ ] User can buy credits in Stripe test mode.
- [ ] Duplicate webhook cannot duplicate credits.
- [ ] Credits are deducted before processing.
- [ ] Ledger records purchase and deduction.
- [ ] Processing job is queued.
- [ ] User sees queued state.

---

# VS4 — User Receives AI-Generated Clip Previews

## User Outcome

After paying for processing, a user can leave the page, return later, and receive 5–10 AI-selected clip previews.

## Layers Crossed

```text
Processing UI -> BullMQ -> Local worker -> FFmpeg audio extraction -> Whisper -> Gemini -> Database -> Preview UI
```

## Work Included

- Implement worker job lifecycle and progress updates.
- Extract mono 16 kHz audio with FFmpeg.
- Run self-hosted Whisper.
- Persist transcript and timestamps.
- Create versioned Gemini clip-selection prompt.
- Send transcript, not raw video, to Gemini.
- Validate structured AI output.
- Reject invalid timestamps.
- Remove near-duplicate clip candidates.
- Persist 5–10 primary candidates when possible.
- Persist backup candidates.
- Show processing steps in UI.
- Show browser-based source-video clip previews.

## Acceptance Criteria

- [ ] Processing continues in background.
- [ ] Whisper produces usable timestamps.
- [ ] Gemini receives transcript, not raw video.
- [ ] 5–10 candidates are generated when possible.
- [ ] Backup candidates are stored.
- [ ] User can preview clip segments before final rendering.
- [ ] No final MP4 has been rendered yet.

---

# VS5 — User Can Edit One Clip Preview Before Rendering

## User Outcome

A user can select one AI-generated clip and change trim, captions, caption position, font size, and highlighted keywords before rendering.

## Layers Crossed

```text
Browser preview -> Metadata editor -> API validation -> Database persistence -> Reload verification
```

## Work Included

- Add editable clip metadata fields.
- Build `ClipPreviewEditor` shell.
- Build trim controls.
- Validate trim boundaries.
- Build CSS caption overlay preview.
- Add caption on/off toggle.
- Add caption text editing.
- Add caption position presets.
- Add caption font-size controls.
- Add keyword-highlight editor.
- Persist edits.
- Restore edits after reload.
- Add unsaved-change protection.

## Acceptance Criteria

- [ ] User can trim clip.
- [ ] User can toggle captions.
- [ ] User can edit caption text.
- [ ] User can adjust caption position.
- [ ] User can adjust font size.
- [ ] User can edit highlighted words.
- [ ] Refresh restores saved metadata.
- [ ] No render occurs during normal edits.

---

# VS6 — User Can Render and Download One Final Vertical MP4 Clip

## User Outcome

A user can render one edited clip into a final 9:16 MP4 and download it.

## Layers Crossed

```text
Render CTA -> API -> BullMQ -> Worker -> ASS subtitles -> FFmpeg -> Storage -> Output metadata -> Authorized download
```

## Work Included

- Create one-clip render endpoint.
- Enqueue render job.
- Generate ASS subtitles from saved metadata.
- Apply trim metadata.
- Apply vertical crop metadata.
- Burn captions when enabled.
- Encode H.264/AAC MP4.
- Persist output metadata and expiration.
- Show render progress.
- Authorize output download.
- Verify preview-to-render visual parity.

## Acceptance Criteria

- [ ] User explicitly starts render.
- [ ] Saved metadata drives render.
- [ ] Final video is 9:16.
- [ ] Caption styling is burned in.
- [ ] Output is stored.
- [ ] User can download MP4.
- [ ] Unauthorized users cannot download another user's output.

---

# VS7 — User Can Manage Multiple Clips and Regenerate a Bad One

## User Outcome

A user can review several candidates, select or delete clips, regenerate one bad clip, and render only selected clips.

## Layers Crossed

```text
Clip list UI -> Candidate state -> API -> Backup-candidate logic/Gemini fallback -> Multi-render queue -> Outputs
```

## Work Included

- Add selected, deleted, and backup candidate states.
- Build multi-clip selection behavior.
- Build clip deletion/deselection behavior.
- Regenerate from unused backup candidate first.
- Fall back to Gemini only when backups are exhausted.
- Do not charge extra for MVP regeneration.
- Render only selected clips.
- Show per-clip render progress and failures.
- Display downloadable output cards.

## Acceptance Criteria

- [ ] User can select/deselect clips.
- [ ] User can delete a candidate.
- [ ] User can regenerate one bad clip.
- [ ] Backup candidate is preferred.
- [ ] Regeneration does not charge extra in MVP.
- [ ] Only selected clips render.

---

# VS8 — User Can Generate, Edit, Render, and Download a Summary Video

## User Outcome

A user can choose summary mode, receive a chronological summary preview, edit segments, render the summary, and download the final MP4.

## Layers Crossed

```text
Summary project -> Gemini selection -> Database -> Preview editor -> FFmpeg concatenation -> Storage -> Download
```

## Work Included

- Create versioned summary-selection prompt.
- Generate chronological segments targeting about 10% of source duration.
- Validate segment boundaries and chronology.
- Persist summary-segment metadata.
- Build summary preview editor.
- Allow trim and removal while preserving chronology.
- Render concatenated summary MP4.
- Preserve original speaker audio.
- Persist summary output.
- Expose authorized download.

## Acceptance Criteria

- [ ] Summary segments remain chronological.
- [ ] Target is about 10% of source duration.
- [ ] User can preview and edit segments.
- [ ] Original speaker audio is preserved.
- [ ] User can render and download summary MP4.

---

# VS9 — Failed Processing Automatically Refunds Credits

## User Outcome

If processing fails before a usable result is produced, the user automatically receives credits back and sees a clear explanation.

## Layers Crossed

```text
Worker failure -> Failure classification -> API transaction -> Credit ledger -> Job state -> Refund UI
```

## Work Included

- Define refund-eligible failures.
- Implement idempotent credit refund transaction.
- Connect worker failures to refund orchestration.
- Prevent duplicate refunds during retries.
- Show clear failure reason and refunded amount.
- Test Whisper failure.
- Test Gemini failure.
- Test FFmpeg failure.

## Acceptance Criteria

- [ ] Eligible failure automatically refunds credits.
- [ ] Refund creates immutable ledger entry.
- [ ] Duplicate refund is impossible.
- [ ] User sees failure reason and refunded amount.
- [ ] Retries do not corrupt balance.

---

# VS10 — Files Expire and Are Deleted After 7 Days

## User Outcome

Users see when source files and outputs expire, and expired files are automatically deleted after 7 days.

## Layers Crossed

```text
Expiration metadata -> UI badges -> Cleanup queue -> Worker -> Storage deletion -> Download denial
```

## Work Included

- Add `expires_at` and `deleted_at` where needed.
- Show expiration badges and notices.
- Create scheduled cleanup job.
- Delete source, audio, temp, clip, and summary files safely.
- Preserve payment, ledger, and minimal job metadata.
- Make cleanup idempotent.
- Ensure expired files cannot be downloaded.

## Acceptance Criteria

- [ ] Expiration is visible before deletion.
- [ ] Files delete after 7 days.
- [ ] Cleanup is safe to rerun.
- [ ] Billing and ledger records remain.
- [ ] Expired files cannot be downloaded.

---

# VS11 — Security, Abuse Protection, and Reliability Are Hardened

## User Outcome

The app behaves safely under abusive traffic, invalid input, duplicate events, cross-user access attempts, unsafe job payloads, and worker failures.

This is a cross-cutting audit slice. Security and validation should already exist in earlier slices where relevant.

## Work Included

- Add Arcjet protection to signup/login.
- Protect upload, analyze, render, and billing endpoints.
- Audit ownership checks for all project resources.
- Audit upload validation and storage paths.
- Audit worker job-payload validation.
- Audit safe subprocess execution.
- Audit Stripe idempotency.
- Audit Gemini output validation and retries.
- Add structured logs.
- Add human-readable error mapping.

## Acceptance Criteria

- [ ] Cross-user access attempts fail.
- [ ] Expensive endpoints are protected.
- [ ] Shell commands cannot be injected through user input.
- [ ] Duplicate Stripe events are harmless.
- [ ] Invalid AI output cannot corrupt project data.
- [ ] Logs contain actionable context without secrets.

---

# VS12 — Full MVP Is Tested, Responsive, and Demo-Ready

## User Outcome

A user can complete the full MVP flow reliably on supported viewport sizes, and the portfolio demo is polished.

## Work Included

- Add critical domain unit tests.
- Add billing and queue integration tests.
- Add E2E clips happy path.
- Add E2E summary happy path.
- Validate responsive dashboard.
- Validate responsive upload flow.
- Validate responsive billing flow.
- Validate responsive outputs.
- Validate desktop-first editor and smaller-screen fallback.
- Polish loading states.
- Polish empty states.
- Polish success states.
- Polish error/refund states.
- Polish expired states.
- Run at least one real video-processing demo.
- Validate portfolio demo script end to end.

## Acceptance Criteria

- [ ] Clips happy path works end to end.
- [ ] Summary happy path works end to end.
- [ ] Critical tests pass.
- [ ] Responsive pages work as defined.
- [ ] Editor fallback works on smaller screens.
- [ ] Demo completes without manual database fixes.
- [ ] Real source video produces usable output.

---

## 6. Slice Completion Rule

A slice is only complete when:

- [ ] The user-visible outcome works.
- [ ] Required UI exists.
- [ ] Required API exists.
- [ ] Required persistence exists.
- [ ] Required queue/worker behavior exists, if applicable.
- [ ] Authorization is enforced.
- [ ] Relevant errors are handled.
- [ ] Verification is recorded.
- [ ] Start and end timestamps are recorded in `progress-tracker.md`.
- [ ] Handoff state is updated.

Do not mark a slice complete because only one technical layer is finished.

---

## 7. Database Introduction by Slice

Create tables only when the current vertical slice needs them.

| Slice | Tables Introduced or Extended |
|---|---|
| VS0 | Drizzle migration baseline |
| VS1 | Better Auth tables and app user/profile data as needed |
| VS2 | `projects`, `uploaded_videos` |
| VS3 | `processing_jobs`, `credit_ledger`, `stripe_customers`, `stripe_payments` |
| VS4 | `transcripts`, `transcript_segments`, `clip_candidates` |
| VS5 | Extend `clip_candidates` with editable metadata fields |
| VS6 | `rendered_outputs` |
| VS7 | Extend candidate state for selected/deleted/backup/regenerated states |
| VS8 | `summary_segments` |
| VS9 | Extend jobs/ledger with idempotent refund metadata as needed |
| VS10 | Add/standardize `expires_at` and `deleted_at` on file-backed records |

Do not create all future tables upfront unless a migration dependency genuinely requires it.

---

## 8. API Introduction by Slice

Introduce endpoints when their user outcome becomes deliverable.

### VS1 — Authentication

Better Auth endpoints/session handling.

### VS2 — Projects and Upload

```text
POST   /projects
GET    /projects
GET    /projects/:projectId
PATCH  /projects/:projectId
DELETE /projects/:projectId
POST   /projects/:projectId/upload
GET    /projects/:projectId/video
DELETE /projects/:projectId/video
```

### VS3 — Billing and Start Processing

```text
GET    /billing/credits
GET    /billing/ledger
POST   /billing/checkout
POST   /billing/webhook
POST   /projects/:projectId/analyze
GET    /projects/:projectId/status
GET    /projects/:projectId/jobs/:jobId/status
```

### VS4–VS7 — Clips

```text
GET    /projects/:projectId/clips
GET    /projects/:projectId/clips/:clipId
PATCH  /projects/:projectId/clips/:clipId
DELETE /projects/:projectId/clips/:clipId
POST   /projects/:projectId/clips/:clipId/regenerate
POST   /projects/:projectId/render
GET    /projects/:projectId/outputs
GET    /projects/:projectId/outputs/:outputId/download
DELETE /projects/:projectId/outputs/:outputId
```

### VS8 — Summary

```text
GET    /projects/:projectId/summary
PATCH  /projects/:projectId/summary
```

Do not build unused endpoints early just to complete an API layer.

---

## 9. UI Screen Introduction by Slice

| Slice | Screens First Needed |
|---|---|
| VS1 | Signup, Login, Dashboard shell |
| VS2 | New Project, Upload Video |
| VS3 | Payment/Credits, Processing queued state, Billing basics |
| VS4 | Processing Status, Clip Preview list |
| VS5 | Clip Preview Editor |
| VS6 | Render Status, Outputs/Download |
| VS7 | Multi-clip management states |
| VS8 | Summary Preview Editor |
| VS9 | Error/Refund states |
| VS10 | Expiration states |
| VS12 | Settings polish and full responsive validation |

---

## 10. Component Introduction by Slice

Do not prebuild the entire UI registry. Add components as a slice first needs them.

### VS1

```text
Button
Input
Card
AppSidebar
AppTopbar
PageHeader
EmptyState
```

### VS2

```text
NewProjectForm
OutputTypeSelector
UploadDropzone
UploadProgressCard
VideoMetadataCard
```

### VS3

```text
CreditBalanceCard
CreditPackCard
CreditCostSummary
StatusBadge
ProcessingProgress
```

### VS4

```text
ProcessingStepList
BackgroundProcessingNotice
ClipList
ClipListItem
ClipPreviewPlayer
AIReasonCard
```

### VS5

```text
ClipPreviewEditor
VerticalCropPreview
CaptionOverlay
CaptionEditor
CaptionTextEditor
CaptionPositionControl
CaptionFontSizeControl
KeywordHighlightEditor
TrimControls
```

### VS6

```text
RenderActionBar
RenderProgress
OutputCard
OutputVideoPreview
DownloadButton
```

### VS7

```text
RegenerateClipButton
RenderClipStatusList
```

### VS8

```text
SummaryPreviewEditor
SummarySegmentList
SummarySegmentCard
SummaryDurationBar
```

### VS9

```text
RefundNotice
ErrorState
```

### VS10

```text
ExpirationBadge
```

---

## 11. Milestones

Milestones are outcome-based.

### Milestone A — Usable Account and Upload

Complete when:

```text
VS0 + VS1 + VS2
```

A user can authenticate, create a project, upload a valid video, and see metadata plus credit estimate.

### Milestone B — Paid Background Processing Entry

Complete when:

```text
VS3
```

A user can buy credits and start a queued processing job safely.

### Milestone C — AI Preview

Complete when:

```text
VS4
```

A user can receive and preview AI-selected clip candidates.

### Milestone D — First Downloadable Clip

Complete when:

```text
VS5 + VS6
```

A user can edit one preview, render it, and download a final MP4.

This is the first strong end-to-end product milestone.

### Milestone E — Complete Clip Workflow

Complete when:

```text
VS7
```

A user can manage multiple clips, regenerate one, and render selected outputs.

### Milestone F — Summary Workflow

Complete when:

```text
VS8
```

A user can generate, edit, render, and download a summary video.

### Milestone G — MVP Hardening

Complete when:

```text
VS9 + VS10 + VS11 + VS12
```

Refunds, retention, security, testing, responsiveness, and demo polish are complete.

---

## 12. Risk Register

### Risk 1 — Whisper Performance

Problem:

Self-hosted transcription may be slow on the local worker machine.

Mitigation:

- Limit MVP input to 30 minutes.
- Use analysis concurrency of 1 initially.
- Consider `faster-whisper`.
- Add GPU support later.

### Risk 2 — Caption Timing Quality

Problem:

Segment timestamps may feel too coarse.

Mitigation:

- Prefer word-level timestamps when practical.
- Start with phrase-level chunks if needed.
- Allow caption editing.

### Risk 3 — Face-Aware Crop Instability

Problem:

Crop may jump between positions.

Mitigation:

- Sample frames.
- Smooth coordinates.
- Prefer stable crop over constant movement.
- Fall back to center crop.

### Risk 4 — AI Clip Quality

Problem:

Gemini may pick weak or overlapping clips.

Mitigation:

- Validate duration.
- Remove near-duplicates.
- Store backup candidates.
- Show AI reason.
- Allow regeneration.

### Risk 5 — Rendering Time

Problem:

Rendering several clips may be slow.

Mitigation:

- Render only selected clips.
- Queue rendering.
- Limit concurrency.
- Never render after every metadata edit.

### Risk 6 — Billing Edge Cases

Problem:

Duplicate webhooks or retries may corrupt credits.

Mitigation:

- Immutable ledger.
- Idempotent webhook events.
- Database transactions.
- Idempotent refunds.

### Risk 7 — Scope Creep

Problem:

RepurposePro may turn into a full video editor.

Mitigation:

Keep MVP editor limited to:

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

## 13. Definition of Done for MVP

RepurposePro MVP is complete when a user can:

1. Create an account.
2. Buy credits.
3. Create a project.
4. Upload an English video under 30 minutes and 500 MB.
5. See required credits before processing.
6. Pay with credits before processing.
7. Leave while background processing continues.
8. Receive 5–10 AI-generated clip previews or a summary preview.
9. Edit clip metadata.
10. Regenerate one bad clip.
11. Render selected clips.
12. Render a summary video.
13. Download final MP4 files.
14. Receive automatic credit refund on eligible failure.
15. See file-expiration notices.
16. Have file assets automatically deleted after 7 days.

---

## 14. Coding Agent Execution Rule

The coding agent should use this loop:

```text
read relevant docs
-> read progress-tracker.md
-> choose next incomplete vertical task
-> record start date/time
-> implement every required layer for that task
-> verify the user outcome
-> record commands and tests
-> record end date/time
-> update progress-tracker.md
-> update handoff state
```

Do not optimize for finishing technical layers.

Optimize for finishing usable vertical slices.
