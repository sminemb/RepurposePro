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
| VS1 | User can sign up, log in, and see protected dashboard | COMPLETED | 2026-07-11 | 10:53 | 2026-07-11 | 21:34 | None | 100% | — |
| VS2 | User can create a project and upload a validated video | COMPLETED | 2026-07-12 | 17:06 | 2026-07-13 | 19:01 | None | 100% | — |
| VS3 | User can buy credits and start a paid processing job | IN_PROGRESS | 2026-07-15 | 10:52 | — | — | VS3-T5 | 50% | — |
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

### VS3-T5 Completion Correction — 2026-07-19 11:44

The preceding VS3-T5 task row is superseded by this completion correction: VS3-T5 is
COMPLETED. It added strict confirmed-start validation, the authenticated analysis-start endpoint,
Arcjet three-per-minute protection, and the owner-authorized atomic PostgreSQL job/deduction/project
transaction. `pnpm ci:check` passes format, lint, strict typecheck, 208 unit tests (13 skipped),
13 PostgreSQL integration tests, and production builds. The live handoff state now advances to
VS3-T6.

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
| Status | COMPLETED |
| Start Date | 2026-07-11 |
| Start Time | 10:53 |
| End Date | 2026-07-11 |
| End Time | 21:34 |
| Progress | 100% |
| Dependency | VS0 |

## Tasks

| Task ID | Vertical Task | Layers Touched | Status | Start Date | Start Time | End Date | End Time | Verification |
|---|---|---|---|---|---|---|---|---|
| VS1-T1 | Configure Better Auth end to end | Web + API + DB | COMPLETED | 2026-07-11 | 10:53 | 2026-07-11 | 21:34 | Better Auth migrations applied to PostgreSQL; web/API booted with healthy dependencies. |
| VS1-T2 | Build signup flow and persist user session | Web + API + DB | COMPLETED | 2026-07-11 | 10:53 | 2026-07-11 | 21:34 | Signup returned 200 and the persisted user rendered on a subsequent dashboard request. |
| VS1-T3 | Build login/logout flow | Web + API | COMPLETED | 2026-07-11 | 10:53 | 2026-07-11 | 21:34 | Login and logout returned 200; logout redirected protected dashboard access to `/login`. |
| VS1-T4 | Build protected dashboard shell | Web | COMPLETED | 2026-07-11 | 10:53 | 2026-07-11 | 21:34 | Dashboard protection and brand-aligned login UI verified at runtime; mobile overflow fixed. |
| VS1-T5 | Enforce protected API access and test unauthorized requests | API + Tests | COMPLETED | 2026-07-11 | 10:53 | 2026-07-11 | 21:34 | Session endpoint returned 200 with the cookie and 401 without it; guard unit tests pass. |
| VS1-UI-R1 | Rework landing, authentication, and protected dashboard UI | Web + Design + Docs | COMPLETED | 2026-07-12 | 06:53 | 2026-07-12 | 12:54 | `pnpm ci:check` and browser verification pass across landing, auth, dashboard, responsive navigation, protected redirect, and sign-out. |
| VS1-UI-R2 | Fix mobile sign-out surface, dashboard icon overflow, and auth validation feedback | Web + Design + Docs | COMPLETED | 2026-07-12 | 13:33 | 2026-07-12 | 13:50 | Static checks pass; 390px browser verification confirms custom inline auth feedback and no native validation bubble. |
| VS1-UI-R3 | Fix mobile drawer stacking and duplicate-account sign-up feedback | Web + Tests + Docs | COMPLETED | 2026-07-12 | 14:00 | 2026-07-12 | 14:26 | `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` pass; focused browser sign-up check reached the auth error state but local DB infrastructure was unavailable. |
| VS1-UI-R1-DT | Configure Chrome DevTools MCP for browser verification | Tooling + Docs | COMPLETED | 2026-07-12 | 11:53 | 2026-07-12 | 11:56 | Added workspace `.mcp.json` with official isolated launcher; JSON and CLI flag validation passed. |
| VS1-UI-R1-DTG | Move Chrome DevTools MCP to global Codex config | Tooling + Docs | COMPLETED | 2026-07-12 | 12:02 | 2026-07-12 | 12:04 | Removed repo config; added global `chrome-devtools` server without `--isolated`. |

## Slice Acceptance Criteria

- [x] User can sign up.
- [x] User can log in.
- [x] User can log out.
- [x] Dashboard is protected.
- [x] API rejects unauthenticated access.
- [x] Session persists correctly.

---

# VS2 — User Can Create a Project and Upload a Validated Video

## User Outcome

An authenticated user can create a clips or summary project, upload a local video, and see its validated metadata and required credits estimate.

This slice crosses project UI, upload UI, API, storage, database, and ffprobe.

## Slice Metadata

| Field | Value |
|---|---|
| Slice ID | VS2 |
| Status | COMPLETED |
| Start Date | 2026-07-12 |
| Start Time | 17:06 |
| End Date | 2026-07-13 |
| End Time | 19:01 |
| Progress | 100% |
| Dependency | VS1 |

## Tasks

| Task ID | Vertical Task | Layers Touched | Status | Start Date | Start Time | End Date | End Time | Verification |
|---|---|---|---|---|---|---|---|---|
| VS2-T1 | Create project schema and create/list API with ownership checks (narrowed scope) | DB + API + Tests | COMPLETED | 2026-07-12 | 17:06 | 2026-07-12 | 17:31 | Migration applied; API typecheck and focused contract/controller tests pass. |
| VS2-T2 | Build new project UI for clips or summary | Web + API | COMPLETED | 2026-07-12 | 17:06 | 2026-07-12 | 17:31 | Workspace typecheck, lint, focused tests, and production build pass. |
| VS2-R1 | Restore API startup after protected-project dependency-injection regression | API + Tests | COMPLETED | 2026-07-12 | 17:54 | 2026-07-12 | 18:03 | Exported `AuthService`, added a module-compilation regression test, and verified API liveness returns HTTP 200. |
| VS2-UI-R3 | Fix active project navigation state | Web + Tests | COMPLETED | 2026-07-13 | 07:19 | 2026-07-13 | 07:29 | Route matcher tests pass; desktop and 390px mobile browser checks show New Project active on `/projects/new`. |
| VS2-T3-R1 | Fix Create Project Server Action export error | Web + Tests | COMPLETED | 2026-07-13 | 09:08 | 2026-07-13 | 09:11 | Server Action module now exports only its async action; regression test and dev loader check pass. |
| VS2-T3 | Build local upload UI with progress | Web | COMPLETED | 2026-07-13 | 08:44 | 2026-07-13 | 08:55 | Multipart upload UI, real byte-progress client, project-scoped upload route, and helper tests pass. |
| VS2-T4 | Implement secure upload endpoint and storage pathing | API + Storage | COMPLETED | 2026-07-13 | 09:40 | 2026-07-13 | 10:07 | Private storage, ownership, multipart limits, and focused API/storage tests pass. |
| VS2-T5 | Probe duration, resolution, audio presence, and format with ffprobe | API/Worker + FFmpeg | COMPLETED | 2026-07-13 | 10:28 | 2026-07-13 | 10:54 | Metadata persistence, focused tests, typecheck, build, and ffprobe availability verified. |
| VS2-DEBUG-1 | Apply the pending uploaded_videos database migration | Database + API verification | COMPLETED | 2026-07-13 | 14:31 | 2026-07-13 | 14:37 | Migration applied; API readiness, 35 focused tests, and API typecheck pass. |
| VS2-DOCS-1 | Reconcile completed VS2 tasks with their execution logs | Documentation | COMPLETED | 2026-07-13 | 14:46 | 2026-07-13 | 14:46 | VS2 task table, slice summary, and handoff reflect the completed upload and diagnostic work. |
| VS2-T6 | Calculate required credits from validated duration | API + Tests | COMPLETED | 2026-07-13 | 16:47 | 2026-07-13 | 16:56 | Shared round-up rule, authorized source-video metadata endpoint, API contract, 66 tests, typecheck, lint, and production build pass. |
| VS2-T7 | Display validated video metadata and required credits estimate | Web + API | COMPLETED | 2026-07-13 | 18:39 | 2026-07-13 | 19:01 | Client/API contract tests, 73-test suite, typecheck, lint, production build, and authenticated desktop/mobile browser upload checks pass. |
| VS2-UI-R4 | Apply Ember copper visual system | Web + Design + Docs | COMPLETED | 2026-07-13 | 17:34 | 2026-07-13 | 18:13 | Ember tokens, copper studio image, docs, static checks, and browser checks pass. |
| VS2-UI-R5 | Remove missed legacy landing CTA gradient | Web + Design + Docs | COMPLETED | 2026-07-13 | 18:25 | 2026-07-13 | 18:31 | FinalCta now uses a named Ember ambient token; static and browser checks pass. |

## Slice Acceptance Criteria

- [x] User creates project.
- [x] User uploads a local video.
- [x] App rejects files over 500 MB.
- [x] App rejects videos over 30 minutes.
- [x] App rejects corrupt videos or missing audio.
- [x] App shows duration and required credits.

---

# VS3 — User Can Buy Credits and Start a Paid Processing Job

## User Outcome

A user with insufficient credits can buy a credit pack through Stripe, then spend credits to start processing the uploaded video.

This slice crosses billing UI, Stripe, API, database ledger, transaction safety, BullMQ queue creation, and job status UI.

## Slice Metadata

| Field | Value |
|---|---|
| Slice ID | VS3 |
| Status | IN_PROGRESS |
| Start Date | 2026-07-15 |
| Start Time | 10:52 |
| End Date | — |
| End Time | — |
| Progress | 60% |
| Dependency | VS2 |

## Tasks

| Task ID | Vertical Task | Layers Touched | Status | Start Date | Start Time | End Date | End Time | Verification |
|---|---|---|---|---|---|---|---|---|
| VS3-T1 | Create credit ledger and Stripe payment schemas | DB | COMPLETED | 2026-07-15 | 10:52 | 2026-07-15 | 11:56 | 81 tests; live PostgreSQL ownership, ledger, trigger, and idempotency checks pass. |
| VS3-T1.1 | Harden payment, job-charge, runtime-role, and integration-test integrity | DB + Infra + Tests | COMPLETED | 2026-07-15 | 12:31 | 2026-07-15 | 13:28 | 13 live PostgreSQL integration tests; migrations rerun as the non-superuser owner; lint/typecheck/test/build pass. |
| VS3-T1.2 | Close runtime credential and mandatory PostgreSQL test gaps | Config + DB + Infra + Tests | COMPLETED | 2026-07-15 | 15:04 | 2026-07-15 | 15:22 | Runtime roles fail closed; admin secrets are isolated; 3 required live PostgreSQL tests pass. |
| VS3-T2 | Build credit balance API and credit-pack UI | API + Web + Shared + Tests | COMPLETED | 2026-07-16 | 18:14 | 2026-07-16 | 19:32 | 123 unit tests and 4 live PostgreSQL integration tests pass; lint, typecheck, and build pass. |
| VS3-T2-R1 | Fail closed on malformed balance rows and close tenant/UI verification gaps | API + DB + Web Verification + Tests | COMPLETED | 2026-07-16 | 20:00 | 2026-07-16 | 20:26 | Missing/malformed aggregate rows return `BILLING_BALANCE_INVALID`; 124 unit tests, 6 live PostgreSQL tests, authenticated production Chrome, lint, typecheck, and build pass. |
| MAINT-6 | Repair repository-wide `pnpm ci:check` gate | Tooling + Formatting + Verification | COMPLETED | 2026-07-16 | 20:36 | 2026-07-16 | 20:53 | Reformatted the reported files, enforced LF for generated Next types, and passed the complete CI gate. |
| MAINT-7 | Add mandatory Prettier adherence rule to AGENTS.md | Documentation + Tooling | COMPLETED | 2026-07-16 | 21:02 | 2026-07-16 | 21:04 | Added mandatory Prettier workflow and verified changed Markdown. |
| MAINT-8 | Remove landing-page ambient glow | Web + Visual Verification | COMPLETED | 2026-07-16 | 21:20 | 2026-07-16 | 21:31 | Removed hero and final-CTA radial gradients; Chrome confirms both sections have no ambient spots and console is clean. |
| MAINT-9 | Alternate landing navigation surface from hero | Web + Visual Verification | COMPLETED | 2026-07-16 | 21:33 | 2026-07-16 | 21:36 | Navigation uses the elevated slate surface while the hero keeps the charcoal background; Chrome screenshot and console check pass. |
| MAINT-10 | Alternate landing footer surface from final CTA | Web + Visual Verification | COMPLETED | 2026-07-18 | 11:21 | 2026-07-18 | 11:28 | Footer now uses charcoal while the final CTA remains elevated; desktop and 390px Chrome checks, Prettier, web typecheck, and focused ESLint pass. |
| MAINT-11 | Tighten landing hero vertical spacing | Web + Visual Verification | COMPLETED | 2026-07-18 | 11:56 | 2026-07-18 | 12:08 | Replaced full-viewport height constraints with content-led spacing; 1440px desktop exposes 272px of the workflow section while mobile media remains fully visible. |
| VS3-T3 | Create Stripe Checkout session and redirect flow | Web + API + Stripe + Arcjet + Tests | COMPLETED | 2026-07-17 | 10:31 | 2026-07-17 | 11:38 | `pnpm ci:check` passes: 169 unit tests (6 skipped), 6 PostgreSQL integration tests, lint, typecheck, Prettier, and production builds; Stripe and Arcjet are mocked. |
| VS3-T4 | Verify Stripe webhook signature and idempotently grant credits | API + DB + Stripe + Tests | COMPLETED | 2026-07-18 | 16:14 | 2026-07-18 | 18:21 | Starter test Checkout returned the user to Billing with 40 credits; signed webhook and exact-event replay both returned HTTP 200; one paid payment, processed event, purchase ledger row, and 40-credit balance remain; full CI passes. |
| VS3-T4.1 | Expose credit ledger history and transaction-history UI | API + Web + Tests | COMPLETED | 2026-07-19 | 08:10 | 2026-07-19 | 08:49 | Authenticated users now see their immutable purchase history with opaque cursor pagination; API/web/integration tests, typecheck, build, focused lint, responsive browser checks, and changed-file formatting pass. Root CI's ESLint stage did not finish within 5 minutes; no diagnostic was emitted. |
| VS3-T5 | Deduct credits and create processing job in one DB transaction | API + DB | IN_PROGRESS | 2026-07-19 | 11:02 | — | — | Implementation started; planned endpoint, runtime-role function, rate limit, and tests are in scope. |
| VS3-T6 | Enqueue analysis job in BullMQ | API + Redis + Queue | NOT_STARTED | — | — | — | — | — |
| VS3-T7 | Show queued processing state in UI | Web + API | NOT_STARTED | — | — | — | — | — |

## Slice Acceptance Criteria

- [x] User can buy credits in Stripe test mode.
- [x] Duplicate webhook cannot grant duplicate credits.
- [x] Credits are deducted before processing.
- [x] Ledger records purchase and deduction.
- [x] Processing job is queued in PostgreSQL.
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

Use this template when appending to `agent-execution-log.md`; do not add completed task narratives to the live tracker.

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

## 9. Archived Agent Logs

Detailed historical logs moved out of this tracker so the live slice status stays readable.

- [Agent Execution Log](agent-execution-log.md) — completed task narratives and detailed verification notes.
- [Agent Operational Logs](agent-operational-logs.md) — files changed, commands, blockers, decisions, and failures.
- [Agent Handoff History](agent-handoff-history.md) — superseded handoff snapshots.
- [Agent Maintenance Log](agent-maintenance-log.md) — completed maintenance task records.

---

## 10. Current Handoff State

```text
Current Slice: VS3 - User can buy credits and start a paid processing job
Current Task: VS3-T6 - Enqueue analysis job in BullMQ
Last Maintenance Task: MAINT-11 - Tighten landing hero vertical spacing
Current Status: NOT_STARTED
Last Completed Task: VS3-T5 - Deduct credits and create processing job in one DB transaction
Next Recommended Task: VS3-T6 - Enqueue the persisted queued analysis job in BullMQ and add its safe recovery behavior without changing financial state.
Uncommitted Changes: VS3-T5 source, tests, contracts, migrations, and task records are included in the completed-task commit. Existing `apps/web/next-env.d.ts` change predates this task and remains intentionally unstaged. Local `.env` remains ignored and must never be committed.
Known Failing Tests: None. `pnpm ci:check` passes format, lint, strict typecheck, 208 unit tests (13 skipped), 13 PostgreSQL integration tests, and production builds.
Known Blockers: None.
Important Context: `POST /api/v1/projects/:projectId/analyze` requires exactly `{ "confirmed": true }`, derives ownership from the server session, and rate-limits three starts per user/minute. `public.start_paid_video_analysis(text, uuid)` is a fixed-search-path `SECURITY DEFINER` routine owned by `repurposepro_owner`; it locks per-user credit activity, creates one queued job/deduction/project mutation atomically, conceals foreign projects, and returns the stored queued/active job on retries. BullMQ enqueue is intentionally deferred to VS3-T6.
Required Commands Before Continuing: Run `pnpm ci:check` after VS3-T6 changes. Add BullMQ enqueue only after the durable queued job exists; pass IDs only and do not deduct/refund credits in queue producers or workers.
Last Updated Date: 2026-07-19
Last Updated Time: 11:44
Last Updated By: Codex
```
