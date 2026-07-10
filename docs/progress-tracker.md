# RepurposePro Coding Agent Progress Tracker

## 1. Purpose

This file is the operational progress tracker for coding agents working on **RepurposePro**.

The tracker is organized around **vertical slices**, not horizontal technical phases.

A vertical slice must deliver a complete, user-visible capability across the necessary layers:

```text
UI
-> API
-> Database
-> Queue/Worker
-> External integrations
-> Verification
```

The goal is to avoid finishing isolated layers that do not produce a usable product outcome.

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

---

## 2. Coding Agent Rules

Before starting any slice or task, the coding agent must:

1. Read the relevant docs.
2. Read this tracker.
3. Identify the next incomplete task.
4. Record start date and time.
5. Mark status as `IN_PROGRESS`.

After completing a task, the coding agent must:

1. Record end date and time.
2. Record files changed.
3. Record commands run.
4. Record tests and verification.
5. Record known limitations.
6. Update slice progress.
7. Update handoff state.

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

---

## 3. Status Values

Use only:

```text
NOT_STARTED
IN_PROGRESS
BLOCKED
IN_REVIEW
COMPLETED
DEFERRED
FAILED
```

---

## 4. Vertical Slice Summary

| Slice | User Outcome | Status | Start Date | Start Time | End Date | End Time | Current Task | Progress | Blocker |
|---|---|---|---|---|---|---|---|---:|---|
| VS0 | Repo boots and core infrastructure is ready | NOT_STARTED | — | — | — | — | — | 0% | — |
| VS1 | User can sign up, log in, and see protected dashboard | NOT_STARTED | — | — | — | — | — | 0% | — |
| VS2 | User can create a project and upload a validated video | NOT_STARTED | — | — | — | — | — | 0% | — |
| VS3 | User can buy credits and start a paid processing job | NOT_STARTED | — | — | — | — | — | 0% | — |
| VS4 | User receives AI-generated clip previews from an uploaded video | NOT_STARTED | — | — | — | — | — | 0% | — |
| VS5 | User can edit one clip preview before rendering | NOT_STARTED | — | — | — | — | — | 0% | — |
| VS6 | User can render and download one final vertical MP4 clip | NOT_STARTED | — | — | — | — | — | 0% | — |
| VS7 | User can manage multiple clips and regenerate a bad one | NOT_STARTED | — | — | — | — | — | 0% | — |
| VS8 | User can generate, edit, render, and download a summary video | NOT_STARTED | — | — | — | — | — | 0% | — |
| VS9 | Failed processing automatically refunds credits and explains why | NOT_STARTED | — | — | — | — | — | 0% | — |
| VS10 | Files expire and are deleted after 7 days | NOT_STARTED | — | — | — | — | — | 0% | — |
| VS11 | Critical security, abuse protection, and reliability are hardened | NOT_STARTED | — | — | — | — | — | 0% | — |
| VS12 | Full MVP happy path is tested, responsive, and demo-ready | NOT_STARTED | — | — | — | — | — | 0% | — |

---

## 5. Current Agent State

```text
Current Slice: Brand identity support (explicit user request; outside product vertical slices)
Current Task: BRAND-001 — Generate RepurposePro brandkit overview board
Current Status: COMPLETED
Current Branch: main

Last Completed Task: BRAND-001 — Generate RepurposePro brandkit overview board
Next Recommended Task: VS0-T1 — Create monorepo with web, api, worker, db, shared, config packages

Last Updated Date: 2026-07-10
Last Updated Time: 12:36
Last Updated By: Codex
```

---

# VS0 — Repo Boots and Core Infrastructure Is Ready

## User Outcome

A developer can clone the repo, install dependencies, start the web app, API, worker, database connection, and Redis connection.

This slice is foundational and is the only intentionally infrastructure-heavy slice.

## Slice Metadata

| Field | Value |
|---|---|
| Slice ID | VS0 |
| Status | NOT_STARTED |
| Start Date | — |
| Start Time | — |
| End Date | — |
| End Time | — |
| Progress | 0% |
| Dependency | None |

## Tasks

| Task ID | Vertical Task | Layers Touched | Status | Start Date | Start Time | End Date | End Time | Verification |
|---|---|---|---|---|---|---|---|---|
| VS0-T1 | Create monorepo with web, api, worker, db, shared, config packages | Repo | NOT_STARTED | — | — | — | — | — |
| VS0-T2 | Boot Next.js + Tailwind CSS v4 + shadcn/ui | Web | NOT_STARTED | — | — | — | — | — |
| VS0-T3 | Boot NestJS API with config validation and logging | API | NOT_STARTED | — | — | — | — | — |
| VS0-T4 | Boot worker process and verify startup | Worker | NOT_STARTED | — | — | — | — | — |
| VS0-T5 | Configure PostgreSQL + Drizzle and run first migration | DB | NOT_STARTED | — | — | — | — | — |
| VS0-T6 | Configure Redis and verify connectivity from API and worker | API + Worker | NOT_STARTED | — | — | — | — | — |
| VS0-T7 | Add lint, typecheck, test scripts, and startup docs | Repo | NOT_STARTED | — | — | — | — | — |

## Slice Acceptance Criteria

- [ ] `apps/web` starts.
- [ ] `apps/api` starts.
- [ ] `apps/worker` starts.
- [ ] PostgreSQL connection succeeds.
- [ ] Redis connection succeeds.
- [ ] Tailwind CSS v4 tokens render correctly.
- [ ] Typecheck passes.
- [ ] Lint passes.

---

# VS1 — User Can Sign Up, Log In, and See Protected Dashboard

## User Outcome

A new user can create an account, log in, see the RepurposePro dashboard, and log out.

This slice crosses auth UI, auth backend/session handling, protected routes, and authorization verification.

## Slice Metadata

| Field | Value |
|---|---|
| Slice ID | VS1 |
| Status | NOT_STARTED |
| Start Date | — |
| Start Time | — |
| End Date | — |
| End Time | — |
| Progress | 0% |
| Dependency | VS0 |

## Tasks

| Task ID | Vertical Task | Layers Touched | Status | Start Date | Start Time | End Date | End Time | Verification |
|---|---|---|---|---|---|---|---|---|
| VS1-T1 | Configure Better Auth end to end | Web + API + DB | NOT_STARTED | — | — | — | — | — |
| VS1-T2 | Build signup flow and persist user session | Web + API + DB | NOT_STARTED | — | — | — | — | — |
| VS1-T3 | Build login/logout flow | Web + API | NOT_STARTED | — | — | — | — | — |
| VS1-T4 | Build protected dashboard shell | Web | NOT_STARTED | — | — | — | — | — |
| VS1-T5 | Enforce protected API access and test unauthorized requests | API + Tests | NOT_STARTED | — | — | — | — | — |

## Slice Acceptance Criteria

- [ ] User can sign up.
- [ ] User can log in.
- [ ] User can log out.
- [ ] Dashboard is protected.
- [ ] API rejects unauthenticated access.
- [ ] Session persists correctly.

---

# VS2 — User Can Create a Project and Upload a Validated Video

## User Outcome

An authenticated user can create a clips or summary project, upload a local video, and see its validated metadata and required credits estimate.

This slice crosses project UI, upload UI, API, storage, database, and ffprobe.

## Slice Metadata

| Field | Value |
|---|---|
| Slice ID | VS2 |
| Status | NOT_STARTED |
| Start Date | — |
| Start Time | — |
| End Date | — |
| End Time | — |
| Progress | 0% |
| Dependency | VS1 |

## Tasks

| Task ID | Vertical Task | Layers Touched | Status | Start Date | Start Time | End Date | End Time | Verification |
|---|---|---|---|---|---|---|---|---|
| VS2-T1 | Create project schema and CRUD with ownership checks | DB + API + Tests | NOT_STARTED | — | — | — | — | — |
| VS2-T2 | Build new project UI for clips or summary | Web + API | NOT_STARTED | — | — | — | — | — |
| VS2-T3 | Build local upload UI with progress | Web | NOT_STARTED | — | — | — | — | — |
| VS2-T4 | Implement secure upload endpoint and storage pathing | API + Storage | NOT_STARTED | — | — | — | — | — |
| VS2-T5 | Probe duration, resolution, audio presence, and format with ffprobe | API/Worker + FFmpeg | NOT_STARTED | — | — | — | — | — |
| VS2-T6 | Enforce 500 MB and 30-minute MVP limits | Web + API + Tests | NOT_STARTED | — | — | — | — | — |
| VS2-T7 | Display validated video metadata and required credits estimate | Web + API | NOT_STARTED | — | — | — | — | — |

## Slice Acceptance Criteria

- [ ] User creates project.
- [ ] User uploads a local video.
- [ ] App rejects files over 500 MB.
- [ ] App rejects videos over 30 minutes.
- [ ] App rejects corrupt videos or missing audio.
- [ ] App shows duration and required credits.

---

# VS3 — User Can Buy Credits and Start a Paid Processing Job

## User Outcome

A user with insufficient credits can buy a credit pack through Stripe, then spend credits to start processing the uploaded video.

This slice crosses billing UI, Stripe, API, database ledger, transaction safety, BullMQ queue creation, and job status UI.

## Slice Metadata

| Field | Value |
|---|---|
| Slice ID | VS3 |
| Status | NOT_STARTED |
| Start Date | — |
| Start Time | — |
| End Date | — |
| End Time | — |
| Progress | 0% |
| Dependency | VS2 |

## Tasks

| Task ID | Vertical Task | Layers Touched | Status | Start Date | Start Time | End Date | End Time | Verification |
|---|---|---|---|---|---|---|---|---|
| VS3-T1 | Create credit ledger and Stripe payment schemas | DB | NOT_STARTED | — | — | — | — | — |
| VS3-T2 | Build credit balance and credit-pack UI | Web | NOT_STARTED | — | — | — | — | — |
| VS3-T3 | Create Stripe Checkout session and redirect flow | Web + API + Stripe | NOT_STARTED | — | — | — | — | — |
| VS3-T4 | Verify Stripe webhook signature and idempotently grant credits | API + DB + Stripe + Tests | NOT_STARTED | — | — | — | — | — |
| VS3-T5 | Deduct credits and create processing job in one DB transaction | API + DB | NOT_STARTED | — | — | — | — | — |
| VS3-T6 | Enqueue analysis job in BullMQ | API + Redis + Queue | NOT_STARTED | — | — | — | — | — |
| VS3-T7 | Show queued processing state in UI | Web + API | NOT_STARTED | — | — | — | — | — |

## Slice Acceptance Criteria

- [ ] User can buy credits in Stripe test mode.
- [ ] Duplicate webhook cannot grant duplicate credits.
- [ ] Credits are deducted before processing.
- [ ] Ledger records purchase and deduction.
- [ ] Processing job is queued.
- [ ] User sees queued state.

---

# VS4 — User Receives AI-Generated Clip Previews

## User Outcome

After paying for processing, a user can leave the page, return later, and receive 5–10 AI-selected clip previews from the source video.

This slice crosses queue processing, local worker, FFmpeg audio extraction, Whisper, Gemini, database persistence, progress UI, and preview UI.

## Slice Metadata

| Field | Value |
|---|---|
| Slice ID | VS4 |
| Status | NOT_STARTED |
| Start Date | — |
| Start Time | — |
| End Date | — |
| End Time | — |
| Progress | 0% |
| Dependency | VS3 |

## Tasks

| Task ID | Vertical Task | Layers Touched | Status | Start Date | Start Time | End Date | End Time | Verification |
|---|---|---|---|---|---|---|---|---|
| VS4-T1 | Implement worker job lifecycle and progress updates | Worker + Queue + DB | NOT_STARTED | — | — | — | — | — |
| VS4-T2 | Extract transcription audio with FFmpeg | Worker + FFmpeg | NOT_STARTED | — | — | — | — | — |
| VS4-T3 | Run self-hosted Whisper and persist timestamped transcript | Worker + Whisper + DB | NOT_STARTED | — | — | — | — | — |
| VS4-T4 | Create versioned Gemini clip-selection prompt | Shared + AI | NOT_STARTED | — | — | — | — | — |
| VS4-T5 | Send transcript to Gemini and validate structured JSON | Worker + Gemini + Validation | NOT_STARTED | — | — | — | — | — |
| VS4-T6 | Persist 5–10 primary clip candidates and backups | DB + Worker | NOT_STARTED | — | — | — | — | — |
| VS4-T7 | Show live processing step state in UI | Web + API | NOT_STARTED | — | — | — | — | — |
| VS4-T8 | Show generated clip list and browser-based source previews | Web + API | NOT_STARTED | — | — | — | — | — |

## Slice Acceptance Criteria

- [ ] Processing continues in background.
- [ ] Whisper produces timestamps.
- [ ] Gemini receives transcript, not raw video.
- [ ] 5–10 candidates are generated when possible.
- [ ] Backup candidates are stored.
- [ ] User can preview clip segments before final render.
- [ ] No final MP4 render has occurred yet.

---

# VS5 — User Can Edit One Clip Preview Before Rendering

## User Outcome

A user can select one AI-generated clip and modify trim, captions, position, font size, and highlighted keywords before rendering.

This slice crosses browser preview behavior, metadata schema, API persistence, validation, and responsive editor UX.

## Slice Metadata

| Field | Value |
|---|---|
| Slice ID | VS5 |
| Status | NOT_STARTED |
| Start Date | — |
| Start Time | — |
| End Date | — |
| End Time | — |
| Progress | 0% |
| Dependency | VS4 |

## Tasks

| Task ID | Vertical Task | Layers Touched | Status | Start Date | Start Time | End Date | End Time | Verification |
|---|---|---|---|---|---|---|---|---|
| VS5-T1 | Add editable clip metadata fields | DB + Shared | NOT_STARTED | — | — | — | — | — |
| VS5-T2 | Build ClipPreviewEditor shell | Web | NOT_STARTED | — | — | — | — | — |
| VS5-T3 | Build trim controls and validate boundaries | Web + API + Tests | NOT_STARTED | — | — | — | — | — |
| VS5-T4 | Build CSS caption overlay preview | Web | NOT_STARTED | — | — | — | — | — |
| VS5-T5 | Add caption toggle, text, size, and position editing | Web + API + DB | NOT_STARTED | — | — | — | — | — |
| VS5-T6 | Add keyword highlight editing | Web + API + DB | NOT_STARTED | — | — | — | — | — |
| VS5-T7 | Persist edits and restore after reload | Web + API + DB + Tests | NOT_STARTED | — | — | — | — | — |
| VS5-T8 | Add unsaved-change protection | Web | NOT_STARTED | — | — | — | — | — |

## Slice Acceptance Criteria

- [ ] User can trim clip.
- [ ] User can toggle captions.
- [ ] User can edit caption text.
- [ ] User can adjust caption position.
- [ ] User can adjust font size.
- [ ] User can edit highlighted words.
- [ ] Refreshing restores saved metadata.
- [ ] No render occurs during normal edits.

---

# VS6 — User Can Render and Download One Final Vertical MP4 Clip

## User Outcome

A user can render one edited clip into a final 9:16 MP4 and download it.

This slice crosses render request UI, queue, worker, FFmpeg, ASS subtitles, output persistence, download authorization, and render progress UI.

## Slice Metadata

| Field | Value |
|---|---|
| Slice ID | VS6 |
| Status | NOT_STARTED |
| Start Date | — |
| Start Time | — |
| End Date | — |
| End Time | — |
| Progress | 0% |
| Dependency | VS5 |

## Tasks

| Task ID | Vertical Task | Layers Touched | Status | Start Date | Start Time | End Date | End Time | Verification |
|---|---|---|---|---|---|---|---|---|
| VS6-T1 | Create render endpoint for one selected clip | Web + API | NOT_STARTED | — | — | — | — | — |
| VS6-T2 | Enqueue render job | API + Queue | NOT_STARTED | — | — | — | — | — |
| VS6-T3 | Generate ASS subtitles from saved caption metadata | Worker + ASS | NOT_STARTED | — | — | — | — | — |
| VS6-T4 | Render 9:16 MP4 with trim, crop, captions, H.264/AAC | Worker + FFmpeg | NOT_STARTED | — | — | — | — | — |
| VS6-T5 | Persist output metadata and expiration | DB + Storage | NOT_STARTED | — | — | — | — | — |
| VS6-T6 | Show render progress | Web + API | NOT_STARTED | — | — | — | — | — |
| VS6-T7 | Authorize and serve MP4 download | API + Storage + Security | NOT_STARTED | — | — | — | — | — |
| VS6-T8 | Verify preview-to-render visual parity | Web + Worker + Manual Test | NOT_STARTED | — | — | — | — | — |

## Slice Acceptance Criteria

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

A user can review several candidates, select or delete clips, regenerate one bad clip from backup candidates, and render only selected clips.

This slice crosses list management UI, candidate state, regeneration logic, backup use, multi-render queue behavior, and output aggregation.

## Slice Metadata

| Field | Value |
|---|---|
| Slice ID | VS7 |
| Status | NOT_STARTED |
| Start Date | — |
| Start Time | — |
| End Date | — |
| End Time | — |
| Progress | 0% |
| Dependency | VS6 |

## Tasks

| Task ID | Vertical Task | Layers Touched | Status | Start Date | Start Time | End Date | End Time | Verification |
|---|---|---|---|---|---|---|---|---|
| VS7-T1 | Add selected/deleted/backup candidate states | DB + API | NOT_STARTED | — | — | — | — | — |
| VS7-T2 | Build multi-clip selection and delete behavior | Web + API | NOT_STARTED | — | — | — | — | — |
| VS7-T3 | Regenerate one clip using unused backup candidate first | Web + API + DB | NOT_STARTED | — | — | — | — | — |
| VS7-T4 | Fall back to Gemini regeneration only when backups are exhausted | Worker + Gemini | NOT_STARTED | — | — | — | — | — |
| VS7-T5 | Render only selected clips in one render job | API + Queue + Worker | NOT_STARTED | — | — | — | — | — |
| VS7-T6 | Show per-clip render progress and failures | Web + API | NOT_STARTED | — | — | — | — | — |
| VS7-T7 | Display downloadable output cards for completed clips | Web + API + Storage | NOT_STARTED | — | — | — | — | — |

## Slice Acceptance Criteria

- [ ] User can select/deselect clips.
- [ ] User can delete a candidate.
- [ ] User can regenerate one bad clip.
- [ ] Backup candidate is preferred.
- [ ] Regeneration does not charge extra in MVP.
- [ ] Only selected clips render.

---

# VS8 — User Can Generate, Edit, Render, and Download a Summary Video

## User Outcome

A user can choose summary mode, receive a chronological summary preview, edit its segments, render it, and download the final MP4.

This slice reuses the processing pipeline but delivers the second core product outcome end to end.

## Slice Metadata

| Field | Value |
|---|---|
| Slice ID | VS8 |
| Status | NOT_STARTED |
| Start Date | — |
| Start Time | — |
| End Date | — |
| End Time | — |
| Progress | 0% |
| Dependency | VS6 |

## Tasks

| Task ID | Vertical Task | Layers Touched | Status | Start Date | Start Time | End Date | End Time | Verification |
|---|---|---|---|---|---|---|---|---|
| VS8-T1 | Create versioned summary-selection prompt | Shared + Gemini | NOT_STARTED | — | — | — | — | — |
| VS8-T2 | Generate chronological summary segments targeting ~10% duration | Worker + Gemini + Validation | NOT_STARTED | — | — | — | — | — |
| VS8-T3 | Persist summary segment metadata | DB + API | NOT_STARTED | — | — | — | — | — |
| VS8-T4 | Build SummaryPreviewEditor | Web + API | NOT_STARTED | — | — | — | — | — |
| VS8-T5 | Allow segment trim and removal while preserving chronology | Web + API + DB | NOT_STARTED | — | — | — | — | — |
| VS8-T6 | Render concatenated summary MP4 with original audio | Worker + FFmpeg | NOT_STARTED | — | — | — | — | — |
| VS8-T7 | Persist and expose summary output download | DB + API + Storage + Web | NOT_STARTED | — | — | — | — | — |

## Slice Acceptance Criteria

- [ ] Summary segments remain chronological.
- [ ] Target is about 10% of source duration.
- [ ] User can preview and edit segments.
- [ ] Original speaker audio is preserved.
- [ ] User can render and download summary MP4.

---

# VS9 — Failed Processing Automatically Refunds Credits

## User Outcome

If processing fails before a usable result is produced, the user receives credits back automatically and sees a clear explanation.

This slice crosses failure classification, DB transaction safety, credit ledger, worker/API coordination, retries, and UI messaging.

## Slice Metadata

| Field | Value |
|---|---|
| Slice ID | VS9 |
| Status | NOT_STARTED |
| Start Date | — |
| Start Time | — |
| End Date | — |
| End Time | — |
| Progress | 0% |
| Dependency | VS3–VS8 |

## Tasks

| Task ID | Vertical Task | Layers Touched | Status | Start Date | Start Time | End Date | End Time | Verification |
|---|---|---|---|---|---|---|---|---|
| VS9-T1 | Define refund-eligible failure rules | Shared + Domain | NOT_STARTED | — | — | — | — | — |
| VS9-T2 | Implement idempotent credit refund transaction | API + DB + Tests | NOT_STARTED | — | — | — | — | — |
| VS9-T3 | Connect worker failures to refund orchestration | Worker + API + Queue | NOT_STARTED | — | — | — | — | — |
| VS9-T4 | Prevent duplicate refunds during retries | API + DB + Tests | NOT_STARTED | — | — | — | — | — |
| VS9-T5 | Build clear failure/refund UI state | Web + API | NOT_STARTED | — | — | — | — | — |
| VS9-T6 | Test Whisper, Gemini, and FFmpeg failure paths | Tests + Worker + API | NOT_STARTED | — | — | — | — | — |

## Slice Acceptance Criteria

- [ ] Eligible failure refunds credits automatically.
- [ ] Refund creates immutable ledger entry.
- [ ] Duplicate refund is impossible.
- [ ] User sees failure reason and refunded amount.
- [ ] Retries do not corrupt balance.

---

# VS10 — Files Expire and Are Deleted After 7 Days

## User Outcome

Users can see when their source and outputs expire, and expired files are automatically deleted after 7 days.

This slice crosses expiration metadata, cleanup jobs, storage deletion, UI badges, and safe retention rules.

## Slice Metadata

| Field | Value |
|---|---|
| Slice ID | VS10 |
| Status | NOT_STARTED |
| Start Date | — |
| Start Time | — |
| End Date | — |
| End Time | — |
| Progress | 0% |
| Dependency | VS6 |

## Tasks

| Task ID | Vertical Task | Layers Touched | Status | Start Date | Start Time | End Date | End Time | Verification |
|---|---|---|---|---|---|---|---|---|
| VS10-T1 | Add `expires_at` and `deleted_at` where needed | DB | NOT_STARTED | — | — | — | — | — |
| VS10-T2 | Show expiration badges and notices | Web + API | NOT_STARTED | — | — | — | — | — |
| VS10-T3 | Create scheduled cleanup job | Queue + Worker | NOT_STARTED | — | — | — | — | — |
| VS10-T4 | Delete source, temp, clip, and summary files safely | Worker + Storage | NOT_STARTED | — | — | — | — | — |
| VS10-T5 | Preserve payment, ledger, and minimal job metadata | DB | NOT_STARTED | — | — | — | — | — |
| VS10-T6 | Make cleanup idempotent and test repeated runs | Worker + Tests | NOT_STARTED | — | — | — | — | — |

## Slice Acceptance Criteria

- [ ] Expiration is visible before deletion.
- [ ] Files delete after 7 days.
- [ ] Cleanup is safe to rerun.
- [ ] Billing and ledger records remain.
- [ ] Expired files cannot be downloaded.

---

# VS11 — Security, Abuse Protection, and Reliability Are Hardened

## User Outcome

The app behaves safely under invalid input, abusive traffic, duplicate events, cross-user access attempts, and worker failures.

This is a cross-cutting hardening slice and should not replace earlier security checks; it audits and strengthens them.

## Slice Metadata

| Field | Value |
|---|---|
| Slice ID | VS11 |
| Status | NOT_STARTED |
| Start Date | — |
| Start Time | — |
| End Date | — |
| End Time | — |
| Progress | 0% |
| Dependency | VS1–VS10 |

## Tasks

| Task ID | Vertical Task | Layers Touched | Status | Start Date | Start Time | End Date | End Time | Verification |
|---|---|---|---|---|---|---|---|---|
| VS11-T1 | Add Arcjet protection to signup, upload, analyze, render, billing | Web/API + Arcjet | NOT_STARTED | — | — | — | — | — |
| VS11-T2 | Audit ownership checks across all project resources | API + DB + Tests | NOT_STARTED | — | — | — | — | — |
| VS11-T3 | Audit upload validation and safe storage paths | API + Storage + Tests | NOT_STARTED | — | — | — | — | — |
| VS11-T4 | Audit worker job payload validation and safe subprocess execution | Worker + Security | NOT_STARTED | — | — | — | — | — |
| VS11-T5 | Audit Stripe webhook idempotency | API + Stripe + Tests | NOT_STARTED | — | — | — | — | — |
| VS11-T6 | Audit Gemini output validation and retry behavior | Worker + Gemini + Tests | NOT_STARTED | — | — | — | — | — |
| VS11-T7 | Add structured logs and human-readable error mapping | API + Worker + Web | NOT_STARTED | — | — | — | — | — |

## Slice Acceptance Criteria

- [ ] Cross-user access attempts fail.
- [ ] Expensive endpoints are protected.
- [ ] Shell commands cannot be injected via user input.
- [ ] Duplicate Stripe events are harmless.
- [ ] Invalid AI output cannot corrupt project data.
- [ ] Logs contain actionable context without secrets.

---

# VS12 — Full MVP Is Tested, Responsive, and Demo-Ready

## User Outcome

A user can complete the full MVP flow reliably on the supported viewport sizes, and the portfolio demo is polished.

This slice validates the whole product rather than isolated modules.

## Slice Metadata

| Field | Value |
|---|---|
| Slice ID | VS12 |
| Status | NOT_STARTED |
| Start Date | — |
| Start Time | — |
| End Date | — |
| End Time | — |
| Progress | 0% |
| Dependency | VS1–VS11 |

## Tasks

| Task ID | Vertical Task | Layers Touched | Status | Start Date | Start Time | End Date | End Time | Verification |
|---|---|---|---|---|---|---|---|---|
| VS12-T1 | Add critical domain unit tests | Tests + Shared | NOT_STARTED | — | — | — | — | — |
| VS12-T2 | Add billing and queue integration tests | Tests + API + DB + Queue | NOT_STARTED | — | — | — | — | — |
| VS12-T3 | Add E2E clips happy path | Web + API + Worker + Tests | NOT_STARTED | — | — | — | — | — |
| VS12-T4 | Add E2E summary happy path | Web + API + Worker + Tests | NOT_STARTED | — | — | — | — | — |
| VS12-T5 | Validate responsive dashboard, upload, billing, outputs | Web + Manual/Visual Test | NOT_STARTED | — | — | — | — | — |
| VS12-T6 | Validate desktop-first editor behavior and smaller-screen fallback | Web + Manual/Visual Test | NOT_STARTED | — | — | — | — | — |
| VS12-T7 | Polish loading, empty, success, error, refund, expired states | Web | NOT_STARTED | — | — | — | — | — |
| VS12-T8 | Run real video-processing demo and record results | Full Stack | NOT_STARTED | — | — | — | — | — |
| VS12-T9 | Validate portfolio demo script end to end | Full Stack | NOT_STARTED | — | — | — | — | — |

## Slice Acceptance Criteria

- [ ] Clips happy path works end to end.
- [ ] Summary happy path works end to end.
- [ ] Critical tests pass.
- [ ] Responsive pages work as defined.
- [ ] Editor fallback works on smaller screens.
- [ ] Demo can be completed without manual database fixes.
- [ ] Real source video produces usable output.

---

## 6. Why These Are Vertical Slices

Each slice must deliver a usable capability.

### Bad horizontal task group

```text
Build all database tables
Build all API routes
Build all frontend pages
Build all worker processors
```

This can produce weeks of work without a usable outcome.

### Good vertical slice

```text
User uploads a video
-> UI accepts file
-> API validates file
-> Storage saves file
-> ffprobe extracts metadata
-> DB stores record
-> UI shows duration and credit estimate
```

This produces a testable user outcome immediately.

---

## 7. Slice Completion Rule

A slice is only `COMPLETED` when:

- [ ] User-visible outcome works.
- [ ] Required UI exists.
- [ ] Required API exists.
- [ ] Required persistence exists.
- [ ] Required worker behavior exists, if applicable.
- [ ] Authorization is enforced.
- [ ] Relevant errors are handled.
- [ ] Verification is recorded.
- [ ] Start and end date/time are recorded.
- [ ] Handoff state is updated.

Do not mark a slice complete because only one technical layer is finished.

---

## 8. Task Execution Log Template

Append one entry for every meaningful completed task.

```md
### <TASK_ID> — <Task Name>

Status: COMPLETED
Start Date: YYYY-MM-DD
Start Time: HH:mm
End Date: YYYY-MM-DD
End Time: HH:mm

User Outcome:
- What changed for the user?

Layers Touched:
- Web
- API
- DB
- Worker
- Queue
- Storage
- Tests

Files Changed:
- path/to/file
- path/to/file

Commands Run:
- command
- command

Verification:
- PASS: description
- PASS: description

Tests:
- command
- result

Assumptions:
- assumption

Known Limitations:
- limitation

Notes:
- note
```

---

## 9. Agent Execution Log

Append completed task logs below this line.

### BRAND-001 — Generate RepurposePro Brandkit Overview Board

Status: COMPLETED
Start Date: 2026-07-10
Start Time: 12:31
End Date: 2026-07-10
End Time: 12:36

User Outcome:
- RepurposePro now has a presentation-ready 3×3 visual brandkit board covering its logo concept, construction logic, product application, tagline, palette, typography, app icon, image direction, and UI system details.

Layers Touched:
- Documentation
- Brand asset

Files Changed:
- docs/brand/repurposepro-brandkit.png
- docs/progress-tracker.md

Commands Run:
- Read the linked Brandkit `SKILL.md` from GitHub.
- Read AGENTS.md and the relevant product, build, tracker, UI-token, UI-rule, UI-registry, and code-standard documentation.
- Generated the board with the built-in image-generation tool.
- Copied the selected generated image into docs/brand/repurposepro-brandkit.png.
- Inspected the saved image at high detail.
- Validated image dimensions, aspect ratio, pixel format, file size, and SHA-256 hash with PowerShell.
- git status --short

Verification:
- PASS: Saved PNG is 1448×1086 pixels at an exact 4:3 aspect ratio.
- PASS: Manual high-detail review confirms a coherent 3×3 grid, consistent RP mark, documented dark surfaces and violet signal accent, readable brand name, correct tagline, palette, typography, and product-application panels.
- PASS: Brand palette follows ui-tokens.md: #0B0D12, #1A1D25, #7B61FF, #B9BDCF, and #F5F6F8.
- PASS: Image-generation quality check found no watermark, random color system, generic startup collage, or excessive glow.

Tests:
- Automated code tests not applicable; no application code changed.
- Manual visual verification passed.

Assumptions:
- A single 3×3 raster overview board is the intended deliverable, following the linked Brandkit skill's default output.
- The logo is a concept direction and should receive trademark/conflict review before commercial registration.

Known Limitations:
- No docs/design/ directory exists, so no side-by-side comparison against canonical design-reference images was possible.
- The board is a raster identity concept, not a production vector logo package or an implementation of the deferred in-product BrandKitEditor feature.

Design Reference Used:
- Linked Brandkit SKILL.md.
- docs/ui-tokens.md, docs/ui-rules.md, docs/ui-registry.md, and docs/project-overview.md.

Design Match Notes:
- Matches the documented premium, dark-tech, cinematic, creator-focused direction; uses subtle borders, restrained glow, Satoshi/Inter typography, violet AI/action signaling, and the one-source-to-many-outputs metaphor.

Intentional Deviations:
- None from available written visual guidance. Canonical docs/design/ references were unavailable.

Notes:
- The explicit user request authorizes this static identity artifact despite brand-kit product functionality being deferred from the MVP.

---

## 10. Files Changed Log

| Date | Task ID | File | Change Summary |
|---|---|---|---|
| 2026-07-10 | BRAND-001 | docs/brand/repurposepro-brandkit.png | Added the generated RepurposePro 3×3 visual brandkit board. |
| 2026-07-10 | BRAND-001 | docs/progress-tracker.md | Recorded task status, verification, limitations, and handoff. |

---

## 11. Commands and Verification Log

| Date | Task ID | Command | Result |
|---|---|---|---|
| 2026-07-10 | BRAND-001 | Built-in image generation using the linked Brandkit workflow | PASS — generated one 3×3 overview board. |
| 2026-07-10 | BRAND-001 | High-detail visual inspection | PASS — layout, mark consistency, palette, typography, and text verified. |
| 2026-07-10 | BRAND-001 | PowerShell image metadata and SHA-256 validation | PASS — 1448×1086, 4:3, 24-bit RGB, valid PNG. |
| 2026-07-10 | BRAND-001 | git status --short | PASS — only tracker and new docs/brand asset are changed. |

Useful commands may include:

```text
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm drizzle-kit generate
pnpm drizzle-kit migrate
ffprobe ...
ffmpeg ...
```

---

## 12. Blocker Log

| Date | Time | Slice | Task ID | Blocker | What Was Tried | Needed to Continue | Status |
|---|---|---|---|---|---|---|---|
| — | — | — | — | — | — | — | — |

---

## 13. Decision Log

| Date | Time | Decision | Reason | Affected Slice | Files Affected |
|---|---|---|---|---|---|
| — | — | — | — | — | — |

Record decisions such as:

- Change Whisper implementation.
- Change Gemini model.
- Change storage strategy.
- Change retry policy.
- Change schema.
- Defer a feature.
- Change crop strategy.

---

## 14. Failure Log

| Date | Time | Slice | Task ID | Failure | Root Cause | Fix | Preventive Action |
|---|---|---|---|---|---|---|---|
| — | — | — | — | — | — | — | — |

---

## 15. Handoff State

The coding agent must update this before ending a session.

```text
Current Slice: VS0 — Repo boots and core infrastructure is ready
Current Task: None
Current Status: NOT_STARTED

Last Completed Task: BRAND-001 — Generate RepurposePro brandkit overview board
Next Recommended Task: VS0-T1 — Create monorepo with web, api, worker, db, shared, config packages

Uncommitted Changes:
- docs/progress-tracker.md
- docs/brand/repurposepro-brandkit.png

Known Failing Tests:
- None

Known Blockers:
- None

Important Context:
- The user explicitly requested and received a static brandkit artifact. This does not implement the deferred in-product BrandKitEditor feature.
- No docs/design/ folder is present. BRAND-001 used ui-tokens.md, ui-rules.md, ui-registry.md, project-overview.md, and the linked Brandkit skill as visual sources.
- The RP logo is a concept direction and should receive trademark/conflict review before commercial registration.

Required Commands Before Continuing:
- None

Last Updated Date: 2026-07-10
Last Updated Time: 12:36
Last Updated By: Codex
```

---

## 16. Recommended Execution Order

Follow this order unless blocked:

```text
VS0
-> VS1
-> VS2
-> VS3
-> VS4
-> VS5
-> VS6
-> VS7
-> VS8
-> VS9
-> VS10
-> VS11
-> VS12
```

Reason:

The order gets to a complete user-visible outcome early:

```text
By VS6:
user signs up
-> uploads video
-> pays
-> receives AI preview
-> edits one clip
-> renders
-> downloads MP4
```

Everything after VS6 expands breadth, reliability, and polish.

---

## 17. MVP Completion Rule

RepurposePro MVP is complete when a user can:

- [ ] Create an account.
- [ ] Create a project.
- [ ] Upload a valid English video under 30 minutes and 500 MB.
- [ ] See credit cost.
- [ ] Buy credits.
- [ ] Start background processing.
- [ ] Receive AI-generated clip previews.
- [ ] Edit clip metadata.
- [ ] Regenerate one bad clip.
- [ ] Render selected clips.
- [ ] Download final MP4s.
- [ ] Generate and render a summary video.
- [ ] Receive automatic credit refund on eligible failure.
- [ ] See expiration notices.
- [ ] Have files deleted automatically after 7 days.

---

## 18. Final Rule for Coding Agents

Do not optimize for finishing layers.

Optimize for finishing usable slices.

Before coding:

```text
read docs
-> read tracker
-> pick next incomplete vertical task
-> record start timestamp
-> implement across required layers
-> verify user outcome
-> record end timestamp
-> update tracker
```

The tracker must always make it possible for another coding agent to continue without guessing.
