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
8. Commit finished task changes with a clear git message after verification passes.
9. If any tracked changes remain intentionally uncommitted, document them in the handoff state with a reason.

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
| VS0 | Repo boots and core infrastructure is ready | COMPLETED | 2026-07-10 | 13:24 | 2026-07-10 | 13:55 | None | 100% | — |
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
Current Slice: VS0 — Repo boots and core infrastructure is ready
Current Task: None
Current Status: COMPLETED
Current Branch: main

Last Completed Task: VS0-T7 — Add lint, typecheck, test scripts, and startup docs
Next Recommended Task: VS1-T1 — Configure Better Auth end to end

Last Updated Date: 2026-07-10
Last Updated Time: 19:28
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
| Status | COMPLETED |
| Start Date | 2026-07-10 |
| Start Time | 13:24 |
| End Date | 2026-07-10 |
| End Time | 13:55 |
| Progress | 100% |
| Dependency | None |

## Tasks

| Task ID | Vertical Task | Layers Touched | Status | Start Date | Start Time | End Date | End Time | Verification |
|---|---|---|---|---|---|---|---|---|
| VS0-T1 | Create monorepo with web, api, worker, db, shared, config packages | Repo | COMPLETED | 2026-07-10 | 13:24 | 2026-07-10 | 13:55 | Seven-project pnpm workspace installs from a frozen lockfile. |
| VS0-T2 | Boot Next.js + Tailwind CSS v4 + shadcn/ui | Web | COMPLETED | 2026-07-10 | 13:24 | 2026-07-10 | 13:55 | Next.js production build and headless visual check passed. |
| VS0-T3 | Boot NestJS API with config validation and logging | API | COMPLETED | 2026-07-10 | 13:24 | 2026-07-10 | 13:55 | API booted; live and ready endpoints returned HTTP 200 with request IDs. |
| VS0-T4 | Boot worker process and verify startup | Worker | COMPLETED | 2026-07-10 | 13:24 | 2026-07-10 | 13:55 | Non-HTTP worker emitted structured worker.ready with both dependencies up. |
| VS0-T5 | Configure PostgreSQL + Drizzle and run first migration | DB | COMPLETED | 2026-07-10 | 13:24 | 2026-07-10 | 13:55 | Baseline migration applied twice; only Drizzle's migration table exists. |
| VS0-T6 | Configure Redis and verify connectivity from API and worker | API + Worker | COMPLETED | 2026-07-10 | 13:24 | 2026-07-10 | 13:55 | Compose health check and Node PING verification passed. |
| VS0-T7 | Add lint, typecheck, test scripts, and startup docs | Repo | COMPLETED | 2026-07-10 | 13:24 | 2026-07-10 | 13:55 | Frozen install and full pnpm ci:check passed. |

## Slice Acceptance Criteria

- [x] `apps/web` starts.
- [x] `apps/api` starts.
- [x] `apps/worker` starts.
- [x] PostgreSQL connection succeeds.
- [x] Redis connection succeeds.
- [x] Tailwind CSS v4 tokens render correctly.
- [x] Typecheck passes.
- [x] Lint passes.

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

### VS0 — Bootable Monorepo Foundation

Status: COMPLETED
Start Date: 2026-07-10
Start Time: 13:24
End Date: 2026-07-10
End Time: 13:55

User Outcome:
- A developer can install one pnpm workspace and start the branded Next.js app, versioned NestJS API, non-HTTP NestJS worker, PostgreSQL, and Redis.
- The API and worker validate configuration, prove both infrastructure connections, use structured logs, and shut down cleanly.

Layers Touched:
- Repository and developer tooling
- Web
- API
- Worker
- PostgreSQL and Drizzle
- Redis and Docker Compose
- Tests and documentation

Files Changed:
- Root workspace/configuration: package.json, pnpm-lock.yaml, pnpm-workspace.yaml, tsconfig.base.json, eslint.config.mjs, vitest.config.ts, prettier.config.mjs, .npmrc, .nvmrc, .gitignore, .prettierignore, and .env.example.
- Runtime/documentation: compose.yaml, README.md, scripts/check-infrastructure.ts, and docs/progress-tracker.md.
- Web: apps/web App Router, Tailwind v4 theme, shadcn configuration/primitives, branded smoke page, and package configuration.
- API: apps/api bootstrap, Pino logging, PostgreSQL/Redis services, health endpoints, tests, and package configuration.
- Worker: apps/worker standalone bootstrap, structured logging, infrastructure lifecycle service, and package configuration.
- Shared packages: packages/config, packages/db, packages/shared, and the VS0 Drizzle migration baseline.

Commands Run:
- Read AGENTS.md and the relevant project, tracker, build, architecture, library, environment, schema, API, code-standard, and UI documentation.
- Used Context7 to verify current Next.js 16, NestJS 11, Tailwind CSS v4, and Drizzle conventions.
- pnpm install / pnpm install --frozen-lockfile
- pnpm dlx shadcn@4.13.0 init and shadcn add button card badge
- pnpm format / pnpm format:check
- pnpm build:packages / pnpm lint / pnpm typecheck / pnpm test / pnpm build / pnpm ci:check
- docker compose config --quiet / pnpm infra:up / pnpm infra:status / pnpm infra:check / pnpm infra:down
- pnpm db:migrate twice
- Queried PostgreSQL catalog tables from the container.
- Started web, API, and worker as hidden background processes and probed all public URLs.
- Captured and inspected a 1440×1000 headless Chrome screenshot.
- git diff --check / git status --short

Verification:
- PASS: `pnpm install --frozen-lockfile` completed for all seven workspace projects.
- PASS: `pnpm ci:check` completed formatting, ESLint, strict TypeScript, seven Vitest tests, and all production builds.
- PASS: Web returned HTTP 200 and contained the RepurposePro page.
- PASS: `/api/v1/health/live` returned the documented success envelope.
- PASS: `/api/v1/health/ready` returned HTTP 200, PostgreSQL/Redis `up` checks, and an `x-request-id` header.
- PASS: Worker emitted `worker.ready` with `database=up`, `redis=up`, and `service=worker`.
- PASS: PostgreSQL and Redis Compose containers became healthy and the Node infrastructure check passed.
- PASS: The no-op migration was safe to rerun; `drizzle.__drizzle_migrations` is the only non-system table.
- PASS: Temporary application processes and Compose containers were stopped; named volumes were preserved.

Tests:
- 2 Vitest files passed; 7 tests passed.
- Configuration tests cover valid parsing, number/boolean coercion, API/web scoping, missing variables, and secret-safe failures.
- Health tests cover liveness, successful readiness, and the documented HTTP 503 response payload.
- Production builds passed for web, API, worker, config, db, and shared packages.

Assumptions:
- Node 22.18 and pnpm 11.10 are the supported VS0 local toolchain.
- PostgreSQL 17 and Redis 7.4 Docker images provide the local development services.
- The root `.env` is the ignored local source of truth; app-specific loaders expose only their owned variables.
- BullMQ and all later-slice integrations remain intentionally absent.

Known Limitations:
- The migration baseline intentionally contains no product tables.
- VS0 provides foundational health and startup behavior only; authentication begins in VS1.

Notes:
- The initial shadcn run required the documented `@/*` import alias; the final configuration is the current `base-nova` preset with RepurposePro semantic tokens reapplied.
- pnpm native-build approvals are explicitly scoped to NestJS, esbuild, and sharp in pnpm-workspace.yaml.

---

## 10. Files Changed Log

| Date | Task ID | File | Change Summary |
|---|---|---|---|
| 2026-07-10 | VS0-T1/T7 | Root workspace and tooling files | Added the pnpm workspace, locked dependencies, strict TypeScript, ESLint, Vitest, Prettier, environment example, and root scripts. |
| 2026-07-10 | VS0-T2 | apps/web | Added the Next.js 16 App Router app, Tailwind v4 tokens, current shadcn primitives, and branded smoke page. |
| 2026-07-10 | VS0-T3 | apps/api | Added the NestJS API, Pino request logging, dependency lifecycle services, and health contracts/tests. |
| 2026-07-10 | VS0-T4 | apps/worker | Added the standalone NestJS worker and structured infrastructure readiness lifecycle. |
| 2026-07-10 | VS0-T5/T6 | packages/config, packages/db, packages/shared, compose.yaml | Added typed config, Drizzle client/baseline, shared health types, and local PostgreSQL/Redis services. |
| 2026-07-10 | VS0-T7 | README.md, scripts/check-infrastructure.ts, docs/progress-tracker.md | Added setup/operations documentation, the direct infrastructure probe, verification evidence, and handoff. |

---

## 11. Commands and Verification Log

| Date | Task ID | Command | Result |
|---|---|---|---|
| 2026-07-10 | VS0 | pnpm install --frozen-lockfile | PASS — all seven workspace projects installed from the committed lockfile. |
| 2026-07-10 | VS0 | pnpm ci:check | PASS — formatting, lint, typecheck, 7 tests, and all builds passed. |
| 2026-07-10 | VS0-T5/T6 | docker compose config/up/status + pnpm infra:check | PASS — PostgreSQL and Redis became healthy and responded to Node probes. |
| 2026-07-10 | VS0-T5 | pnpm db:migrate twice + PostgreSQL catalog query | PASS — repeat-safe baseline; only Drizzle migration history exists. |
| 2026-07-10 | VS0-T2/T4 | Production process startup and HTTP/log probes | PASS — web/API returned 200 and worker emitted worker.ready. |
| 2026-07-10 | VS0-T2 | Headless Chrome screenshot and high-detail inspection | PASS — Tailwind v4 tokens and shadcn primitives render in the documented visual system. |
| 2026-07-10 | VS0 | pnpm infra:down + git diff --check | PASS — services stopped with volumes preserved and no whitespace errors. |

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
| 2026-07-10 | 13:24 | Use pnpm workspaces without Turborepo and Docker Compose for local PostgreSQL/Redis. | Matches the approved plan and keeps the VS0 developer path minimal and reproducible. | VS0 | Root workspace files, compose.yaml |
| 2026-07-10 | 13:30 | Keep the VS0 migration as a no-op baseline. | Product tables must be introduced only by the slice that needs them. | VS0, VS1+ | packages/db/drizzle |
| 2026-07-10 | 13:36 | Use shadcn's current base-nova preset, then replace generated theme values with canonical RepurposePro tokens. | Preserves current primitive infrastructure without changing the documented visual system. | VS0 UI | apps/web |
| 2026-07-10 | 13:40 | Pin TypeScript 6.0.3 instead of the newer TypeScript 7 release. | Current typescript-eslint 8 supports TypeScript versions below 6.1; 6.0.3 is the newest compatible release. | VS0 tooling | package manifests, lockfile |

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
| 2026-07-10 | 13:34 | VS0 | VS0-T2 | Initial shadcn initialization rejected the web scaffold. | The required `@/*` import alias was not yet declared. | Added the TypeScript paths alias and reran initialization successfully. | Keep the alias in the committed Next.js tsconfig. |
| 2026-07-10 | 13:38 | VS0 | VS0-T1 | Initial pnpm install stopped on ignored native builds. | pnpm 11 requires explicit per-package build approval. | Added `allowBuilds` for NestJS, esbuild, and sharp and reran the install. | Commit the build policy in pnpm-workspace.yaml. |
| 2026-07-10 | 13:42 | VS0 | VS0-T7 | Initial compiler/lint passes found TypeScript 6 deprecations and unregistered lint-only files. | Legacy module resolution, inherited declaration maps, and ESLint project-service scope needed current configuration. | Moved to Node16 resolution, corrected app overrides, and registered lint-only files. | Full frozen-lockfile `pnpm ci:check` now covers these configurations. |

---

## 15. Handoff State

The coding agent must update this before ending a session.

```text
Current Slice: VS0 — Repo boots and core infrastructure is ready
Current Task: None
Current Status: COMPLETED

Last Completed Task: VS0-T7 — Add lint, typecheck, test scripts, and startup docs
Next Recommended Task: VS1-T1 — Configure Better Auth end to end

Uncommitted Changes:
- None

Known Failing Tests:
- None

Known Blockers:
- None

Important Context:
- VS0 is complete; `pnpm ci:check` and runtime/visual verification passed.
- Docker containers are stopped, but the named PostgreSQL and Redis volumes are preserved.
- A local ignored `.env` was copied from `.env.example` for verification; fresh clones must do the same.
- The Drizzle baseline creates only `drizzle.__drizzle_migrations`; no product tables exist yet.
- Better Auth, BullMQ, Stripe, Arcjet, FFmpeg, Whisper, Gemini, and product storage are intentionally absent until their documented slices.

Required Commands Before Continuing:
- pnpm infra:up
- pnpm db:migrate
- pnpm dev

Last Updated Date: 2026-07-10
Last Updated Time: 19:28
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
