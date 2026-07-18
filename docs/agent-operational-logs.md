# Agent Operational Logs

Historical files-changed, command, blocker, decision, and failure logs moved from docs/progress-tracker.md.

## Files Changed Log

| Date | Task ID | File | Change Summary |
|---|---|---|---|
| 2026-07-10 | VS0-T1/T7 | Root workspace and tooling files | Added the pnpm workspace, locked dependencies, strict TypeScript, ESLint, Vitest, Prettier, environment example, and root scripts. |
| 2026-07-10 | VS0-T2 | apps/web | Added the Next.js 16 App Router app, Tailwind v4 tokens, current shadcn primitives, and branded smoke page. |
| 2026-07-10 | VS0-T3 | apps/api | Added the NestJS API, Pino request logging, dependency lifecycle services, and health contracts/tests. |
| 2026-07-10 | VS0-T4 | apps/worker | Added the standalone NestJS worker and structured infrastructure readiness lifecycle. |
| 2026-07-10 | VS0-T5/T6 | packages/config, packages/db, packages/shared, compose.yaml | Added typed config, Drizzle client/baseline, shared health types, and local PostgreSQL/Redis services. |
| 2026-07-10 | VS0-T7 | README.md, scripts/check-infrastructure.ts, docs/progress-tracker.md | Added setup/operations documentation, the direct infrastructure probe, verification evidence, and handoff. |
| 2026-07-11 | VS1-T1/T5 | apps/web, apps/api, packages/config, packages/db | Added Better Auth, database-backed sessions, protected web/API routes, auth UI, migrations, tests, and runtime verification. |
| 2026-07-12 | VS1-UI-R1 | apps/web, docs/ui-registry.md, docs/progress-tracker.md | Reworked the landing, auth, and protected dashboard UI; added shared shell components and generated creator media. |
| 2026-07-12 | VS1-UI-R1-DT | .mcp.json, docs/progress-tracker.md | Configured official Chrome DevTools MCP with isolated profile and usage-statistics opt-out. |
| 2026-07-12 | VS1-UI-R1-DTG | global Codex config, docs/progress-tracker.md | Moved Chrome DevTools MCP to global config and removed project `.mcp.json`; removed isolated mode. |
| 2026-07-12 | VS1-UI-R2 | apps/web auth/dashboard/navigation, docs/progress-tracker.md | Contained the mobile account footer, replaced the overflowing empty-state glyph, and added branded custom auth validation feedback. |
| 2026-07-12 | VS2-R1 | apps/api auth/projects, eslint.config.mjs, docs/progress-tracker.md | Exported the authentication service required by the reusable guard, added a module-resolution regression test, and raised the typed-lint default-project ceiling from 8 to 10. |
| 2026-07-13 | VS2-UI-R3 | apps/web/components/app/app-sidebar.tsx, apps/web/components/app/app-navigation.ts, apps/web/components/app/app-sidebar.spec.ts, docs/progress-tracker.md | Derived navigation active state from the current pathname and covered project route matching with focused tests. |
| 2026-07-13 | VS2-T3 | apps/web upload route/features, project creation/list flow, docs/progress-tracker.md | Added a project-scoped local-video upload screen, browser-native multipart progress client, and the project routing needed to reach it. |
| 2026-07-13 | VS2-T3-R1 | apps/web project action/form, docs/progress-tracker.md | Removed the invalid runtime export from the Server Action module and guarded the Next.js export restriction. |
| 2026-07-13 | DOCS-SKILLS-20260713 | AGENTS.md, docs/progress-tracker.md | Required agents to use relevant installed skills from `addyosmani/agent-skills` and recorded the docs-only update. |
| 2026-07-13 | VS2-T4 | apps/api projects/storage, packages/config, API docs, tests, lint config | Added private local source storage, protected bounded multipart upload handling, startup configuration, contract/error coverage, and task handoff. |
| 2026-07-13 | DOCS-TRACKER-SPLIT-20260713 | docs/progress-tracker.md, docs/agent-execution-log.md, docs/agent-operational-logs.md, docs/agent-handoff-history.md | Moved historical tracker content into focused archive docs and kept the tracker focused on live slice status plus current handoff. |
| 2026-07-13 | VS2-T6 | apps/api projects, packages/shared, eslint.config.mjs, docs | Added shared minute-rounding rule and authorized source-video metadata API with safe not-found behavior; added regression tests and typed-lint support for shared tests. |
| 2026-07-13 | VS2-UI-R4 | Global design tokens, landing media, active design docs, docs/progress-tracker.md | Applied the Ember copper visual system, primary-action foregrounds, and landing ambient treatment. |
| 2026-07-13 | VS2-UI-R5 | apps/web/app/globals.css, landing pricing CTA, docs/ui-tokens.md, docs/progress-tracker.md | Removed the remaining legacy landing CTA gradient and routed the glow through the named Ember ambient token. |
| 2026-07-13 | VS2-T7 | apps/web upload client/components, docs/progress-tracker.md | Displayed validated source metadata and server-derived rounded credit estimates after upload. |
| 2026-07-15 | VS3-T1 | packages/db schema/migrations/tests, docs/database-schema.md, docs/progress-tracker.md | Added credit ledger, Stripe payment, webhook, customer, and processing-job foundation schema with integrity constraints. |
| 2026-07-15 | VS3-T1.1 | packages/db migrations/tests, role provisioning, Compose/configuration, database/environment docs, lint/typecheck wiring, docs/progress-tracker.md | Hardened billing integrity, ownership boundaries, runtime role permissions, and migration/test execution. |
| 2026-07-15 | VS3-T1.2 | packages/config, database/runtime environment templates, Drizzle/Compose/test scripts, README.md, database/environment docs, docs/progress-tracker.md | Closed runtime credential separation and mandatory live PostgreSQL test wiring. |
| 2026-07-16 | MAINT-5 | AGENTS.md, progress tracker, execution/operational/handoff/maintenance archives | Removed stale duplicate live state, archived referenced completed task narratives, and documented recurring log-maintenance rules. |
| 2026-07-16 | MAINT-7 | AGENTS.md, progress tracker, execution/operational/handoff/maintenance archives | Added mandatory Prettier adherence, changed-file format checks, repository-wide format guidance, and whitespace verification to agent workflow. |

---

## Commands and Verification Log

| Date | Task ID | Command | Result |
|---|---|---|---|
| 2026-07-10 | VS0 | pnpm install --frozen-lockfile | PASS — all seven workspace projects installed from the committed lockfile. |
| 2026-07-10 | VS0 | pnpm ci:check | PASS — formatting, lint, typecheck, 7 tests, and all builds passed. |
| 2026-07-10 | VS0-T5/T6 | docker compose config/up/status + pnpm infra:check | PASS — PostgreSQL and Redis became healthy and responded to Node probes. |
| 2026-07-10 | VS0-T5 | pnpm db:migrate twice + PostgreSQL catalog query | PASS — repeat-safe baseline; only Drizzle migration history exists. |
| 2026-07-10 | VS0-T2/T4 | Production process startup and HTTP/log probes | PASS — web/API returned 200 and worker emitted worker.ready. |
| 2026-07-10 | VS0-T2 | Headless Chrome screenshot and high-detail inspection | PASS — Tailwind v4 tokens and shadcn primitives render in the documented visual system. |
| 2026-07-10 | VS0 | pnpm infra:down + git diff --check | PASS — services stopped with volumes preserved and no whitespace errors. |
| 2026-07-11 | VS1 | pnpm db:migrate + live auth HTTP probes | PASS — migrations applied; signup/login/logout/session persistence and protected API behavior verified. |
| 2026-07-11 | VS1 | pnpm format:check / lint / typecheck / test / build | PASS — formatting, ESLint, strict types, 11 tests, and all production builds passed. |
| 2026-07-11 | VS1-T4 | Headless Chrome desktop/mobile inspection | PASS — desktop brand treatment verified; mobile overflow found and fixed. |
| 2026-07-12 | VS1-UI-R1 | pnpm ci:check | PASS — formatting, ESLint, strict types, 11 tests, and all production builds passed. |
| 2026-07-12 | VS1-UI-R1 | Chrome DevTools responsive + auth verification | PASS — landing, login, signup, dashboard, mobile drawer focus return, protected redirect, and sign-out verified; no console errors or horizontal overflow. |
| 2026-07-12 | VS1-UI-R1 | Lighthouse desktop audit | PASS — accessibility 100, SEO 100, agentic browsing 100; HTTP-only best-practices finding is local-development expected. |
| 2026-07-12 | VS1-UI-R1 | `git commit` | PASS — verified UI overhaul committed on `main`. |
| 2026-07-12 | VS1-UI-R1-DT | `.mcp.json` parse + Chrome DevTools MCP CLI help | PASS — workspace config parses; official package and requested flags validated. |
| 2026-07-12 | VS1-UI-R1-DTG | global config inspection + repo file check | PASS — global server configured without `--isolated`; project `.mcp.json` absent. |
| 2026-07-12 | VS1-UI-R2 | `pnpm typecheck` / targeted ESLint / `pnpm lint` / `pnpm test` / `pnpm build` | PASS — strict types, ESLint, 11 tests, and all production builds passed. |
| 2026-07-12 | VS1-UI-R2 | Chrome DevTools 390px auth validation check | PASS — custom inline alert rendered; native validation bubble absent; console clean. |

| 2026-07-12 | VS2-R1 | focused module test / API typecheck / `pnpm lint` / `pnpm test` / API liveness probe | PASS — regression test reproduced then passed; API typecheck, lint, 22 tests, and HTTP 200 liveness pass. |
| 2026-07-12 | VS2-R1 | `pnpm format:check` | KNOWN BASELINE FAILURE — Prettier reports 11 unrelated files; task files are not listed. |
| 2026-07-13 | VS2-UI-R3 | focused Vitest / web typecheck / lint / full test / build / Chrome DevTools / git diff --check | PASS — 5 route-matcher tests, 27 total tests, typecheck, lint, production builds, desktop/mobile active-state checks, clean browser console, and whitespace validation pass. |
| 2026-07-13 | DOCS-SKILLS-20260713 | `Get-Content` docs reads + `git diff --check -- AGENTS.md docs/progress-tracker.md` + `git diff -- AGENTS.md docs/progress-tracker.md` + `git commit` | PASS - required docs were read, whitespace check passed, the documentation-only diff was reviewed, and task files were committed. |
| 2026-07-13 | VS2-T4 | Focused Vitest, `pnpm lint`, `pnpm test`, `pnpm typecheck`, `pnpm build`, targeted Prettier check, `git diff --check` | PASS — 47 tests, lint, strict types, and production builds pass; targeted formatting and whitespace checks pass. |
| 2026-07-13 | VS2-T4 | `pnpm audit --prod` | KNOWN BASELINE — reports two moderate transitive vulnerabilities in existing Better Auth/Next development dependencies; no high or critical finding and no task-scoped upgrade applied. |
| 2026-07-13 | DOCS-TRACKER-SPLIT-20260713 | `pnpm exec prettier --check docs/progress-tracker.md docs/agent-execution-log.md docs/agent-operational-logs.md docs/agent-handoff-history.md` + `git diff --check` | PASS — docs formatting and whitespace checks passed after archive split. |
| 2026-07-13 | VS2-T6 | Focused Vitest + `pnpm typecheck` + `pnpm lint` + `pnpm test` + `pnpm build` + `git diff --check` | PASS — 66 tests, strict types, lint, and all production builds pass. |

| 2026-07-13 | VS2-UI-R4 | `pnpm lint` / `pnpm typecheck` / `pnpm test` / `pnpm build` / `pnpm ci:check` / source scan / contrast check | PASS — Ember token centralization, contrast, responsive rendering, redirects, 66 tests, and production build verified; pre-existing formatting drift remains. |
| 2026-07-13 | VS2-UI-R5 | source scan / `pnpm lint` / `pnpm typecheck` / browser checks | PASS — no legacy accent literals remain; CTA has no 390px overflow or console errors. |
| 2026-07-13 | VS2-T7 | Focused Vitest / `pnpm test` / `pnpm typecheck` / `pnpm lint` / web build / `git diff --check` | PASS — 73 tests, metadata/credit display, authenticated desktop/mobile upload checks, and production build verified. |
| 2026-07-15 | VS3-T1 | Focused Vitest / `pnpm db:generate` / `pnpm infra:up` / repeated `pnpm db:migrate` / Docker PostgreSQL negative-case checks / lint / typecheck / test / build | PASS — schema rows, constraints, ownership, triggers, idempotency, 81 tests, lint, typecheck, and build verified. |
| 2026-07-15 | VS3-T1.1 | Live PostgreSQL RED/green integration tests / role provisioning / owner migrations / `pnpm lint` / `pnpm typecheck` / `pnpm test` / `pnpm build` / `pnpm format:check` / `git diff --check` | PASS — immutable financial fields, runtime boundary, repeatable owner migrations, and 13 live integration assertions verified; eight unrelated formatting findings remain. |
| 2026-07-15 | VS3-T1.2 | Focused config tests / config-script typechecks / targeted ESLint and Prettier / role provisioning / migrations / `pnpm infra:status` / `pnpm test:db-integration` / lint / typecheck / test / build / format check / diff check | PASS — runtime accepts only `repurposepro_runtime`; isolated admin credentials and required PostgreSQL test gate verified; 88 tests pass. |

| 2026-07-16 | MAINT-5 | Documentation audit / archive reconciliation / Prettier checks on changed Markdown / git diff --check | PASS — stale Current Agent State content removed; one current handoff remains; archive and recurring-log rules synchronized. |
| 2026-07-16 | VS3-T2 | Red/green billing tests / HTTP module test / `pnpm test` / `pnpm lint` / `pnpm typecheck` / `pnpm test:db-integration` / `pnpm build` | PASS — 123 unit tests, 4 live PostgreSQL tests, lint, types, and production build pass. |
| 2026-07-16 | VS3-T2 | `pnpm format:check` / `pnpm ci:check` | KNOWN BASELINE FAILURE — six unrelated pre-existing files fail Prettier; no VS3-T2 file is listed. |
| 2026-07-16 | VS3-T2-R1 | Focused fail-closed RED/GREEN billing tests | PASS — missing aggregate rows and missing `balance` reproduced a false zero before the fix; 24 focused tests pass after separating query and validation errors. |
| 2026-07-16 | VS3-T2-R1 | Live guard/controller/service/Drizzle/PostgreSQL integration | PASS — session user A returns 29 despite a user-B query parameter; user B returns 999; empty user returns 0 under the restricted runtime role. |
| 2026-07-16 | VS3-T2-R1 | Authenticated optimized Next.js + headless Chrome desktop/mobile verification | PASS — Billing active states, responsive grids, no overflow, inert checkout controls, persistent unavailable text, and dashboard `/billing` navigation verified without HMR. |
| 2026-07-16 | VS3-T2-R1 | `pnpm lint` / `pnpm typecheck` / `pnpm test` / `pnpm test:db-integration` / `pnpm build` | PASS — lint, strict types, 124 unit tests, 6 live PostgreSQL tests, and production builds pass. |
| 2026-07-16 | VS3-T2-R1 | `pnpm ci:check` / targeted Prettier | KNOWN BASELINE FAILURE — full CI stops only at the same six pre-existing formatting files; all repair files pass targeted Prettier. |
| 2026-07-16 | MAINT-7 | `pnpm exec prettier --write AGENTS.md docs/progress-tracker.md` / `pnpm exec prettier --check AGENTS.md docs/progress-tracker.md` / `git diff --check` | PASS — changed Markdown follows repository formatting and whitespace validation passes. |

| 2026-07-16 | MAINT-8 | Removed hero and final-CTA radial-gradient overlays; Chrome screenshot and console checks | PASS - no ambient spots remain; Chrome console has no warnings or errors. |
| 2026-07-16 | MAINT-8 | changed-file Prettier / web typecheck / `pnpm lint` / `pnpm test` / `git diff --check` | PASS - formatting, types, lint, 124 unit tests, and whitespace checks pass. |
| 2026-07-16 | MAINT-9 | Navigation elevated-surface update; Chrome screenshot and console check | PASS - navigation slate surface visibly alternates from charcoal hero; console clean. |
| 2026-07-16 | MAINT-9 | changed-file Prettier / `pnpm lint` / web typecheck / `git diff --check` | PASS - formatting, lint, types, and whitespace checks pass. |
| 2026-07-16 | MAINT-8 / MAINT-9 | `git commit -m "fix: separate landing navigation and remove glows"` | PASS - committed as `549e5a4`. |

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

### MAINT-8 - Landing Ambient Glow Removal

- Files changed: `landing-hero-workflow.tsx`, `landing-pricing-cta.tsx`, and MAINT-8 records.
- Decision: remove only decorative hero and final-CTA radial-gradient overlays; preserve ember CTA glow, imagery, and layout.
- Verification: Chrome screenshots confirm both ambient spots are removed; console has no warnings/errors; Prettier, typecheck, lint, 124 unit tests, and whitespace checks pass.

---

## Blocker Log

| Date | Time | Slice | Task ID | Blocker | What Was Tried | Needed to Continue | Status |
|---|---|---|---|---|---|---|---|
| — | — | — | — | — | — | — | — |
| 2026-07-16 | 19:18 | VS3 | VS3-T2 | Authenticated browser verification cannot complete. | Local Next.js HMR WebSocket resets prevented signup/login from issuing an auth request; `/billing` redirect to `/login` succeeded. | Restore stable local HMR/auth interaction and recheck Billing desktop/mobile authenticated states. | OPEN |
| 2026-07-16 | 20:26 | VS3 | VS3-T2-R1 | Follow-up to the 19:18 authenticated-browser blocker. | Built and ran an optimized Next.js server outside HMR, created a disposable authenticated session, and verified Billing/dashboard through headless Chrome at desktop/mobile widths. | No further action for T2; six disposable review accounts and temporary browser profiles were removed. | RESOLVED |

---

## Decision Log

| Date | Time | Decision | Reason | Affected Slice | Files Affected |
|---|---|---|---|---|---|
| 2026-07-10 | 13:24 | Use pnpm workspaces without Turborepo and Docker Compose for local PostgreSQL/Redis. | Matches the approved plan and keeps the VS0 developer path minimal and reproducible. | VS0 | Root workspace files, compose.yaml |
| 2026-07-10 | 13:30 | Keep the VS0 migration as a no-op baseline. | Product tables must be introduced only by the slice that needs them. | VS0, VS1+ | packages/db/drizzle |
| 2026-07-10 | 13:36 | Use shadcn's current base-nova preset, then replace generated theme values with canonical RepurposePro tokens. | Preserves current primitive infrastructure without changing the documented visual system. | VS0 UI | apps/web |
| 2026-07-10 | 13:40 | Pin TypeScript 6.0.3 instead of the newer TypeScript 7 release. | Current typescript-eslint 8 supports TypeScript versions below 6.1; 6.0.3 is the newest compatible release. | VS0 tooling | package manifests, lockfile |
| 2026-07-13 | 10:07 | Store VS2-T4 uploads privately without an `uploaded_videos` row. | Keeps the task scoped to bounded storage while retaining a private manifest for VS2-T5 probing and VS2-T7 persistence. | VS2 | apps/api storage/projects, docs/api-contracts.md |
| 2026-07-13 | 15:19 | Split historical progress tracker logs into focused archive docs. | The tracker had grown into a mixed live-status and historical archive; moving completed logs keeps current slice state readable without losing handoff evidence. | Docs | docs/progress-tracker.md, docs/agent-execution-log.md, docs/agent-operational-logs.md, docs/agent-handoff-history.md |
| 2026-07-13 | 16:56 | Derive required credits from persisted video duration rather than storing a duplicate. | VS3 must recalculate credits inside its payment transaction; one canonical duration-derived rule prevents preview and charge drift. | VS2, VS3 | packages/shared, apps/api projects, docs/api-contracts.md |

| 2026-07-15 | 13:28 | Keep processing charges reconciled to immutable `processing_jobs.credits_charged`; runtime cannot write raw ledger or Stripe source records. | Prevents financial state bypass and leaves VS3-T4/T5 to add narrowly scoped owner-authorized write procedures. | VS3 | packages/db, role boundary migrations, database/environment docs |
| 2026-07-15 | 15:22 | Restrict API, worker, and auth runtime credentials to `repurposepro_runtime`; isolate bootstrap, migration, provisioning, and live-test credentials. | Ensures application processes cannot escalate into administrative database operations and makes the PostgreSQL integration gate explicit. | VS3 | packages/config, Compose, environment templates, CI/test scripts |
| 2026-07-16 | 19:18 | Balance API returns only a session-scoped immutable-ledger sum; public packs exclude Stripe IDs. | Preserves financial accuracy, tenant isolation, and client/server trust boundaries before Checkout exists. | VS3 | apps/api billing, packages/shared billing, apps/web billing, docs/api-contracts.md |

Record decisions such as:

- Change Whisper implementation.
- Change Gemini model.
- Change storage strategy.
- Change retry policy.
- Change schema.
- Defer a feature.
- Change crop strategy.

---

## Failure Log

| Date | Time | Slice | Task ID | Failure | Root Cause | Fix | Preventive Action |
|---|---|---|---|---|---|---|---|
| 2026-07-10 | 13:34 | VS0 | VS0-T2 | Initial shadcn initialization rejected the web scaffold. | The required `@/*` import alias was not yet declared. | Added the TypeScript paths alias and reran initialization successfully. | Keep the alias in the committed Next.js tsconfig. |
| 2026-07-10 | 13:38 | VS0 | VS0-T1 | Initial pnpm install stopped on ignored native builds. | pnpm 11 requires explicit per-package build approval. | Added `allowBuilds` for NestJS, esbuild, and sharp and reran the install. | Commit the build policy in pnpm-workspace.yaml. |
| 2026-07-10 | 13:42 | VS0 | VS0-T7 | Initial compiler/lint passes found TypeScript 6 deprecations and unregistered lint-only files. | Legacy module resolution, inherited declaration maps, and ESLint project-service scope needed current configuration. | Moved to Node16 resolution, corrected app overrides, and registered lint-only files. | Full frozen-lockfile `pnpm ci:check` now covers these configurations. |

| 2026-07-12 | 17:55 | VS2 | VS2-R1 | API exited before binding its port when the protected projects controller was loaded. | `AuthModule` exported `AuthGuard` without its `AuthService` dependency. | Exported `AuthService` and added a module-compilation regression test. | The test now proves all dependencies for the reusable guard resolve in `ProjectsModule`. |
| 2026-07-16 | 19:18 | VS3 | VS3-T2 | `pnpm ci:check` stopped at formatting verification. | Six pre-existing non-VS3-T2 files do not match Prettier; task files passed targeted formatting checks. | Recorded the baseline and ran lint, typecheck, unit, database-integration, and build checks separately. | Restore repository-wide formatting baseline before treating `ci:check` as a task gate. |
| 2026-07-16 | 19:30 | VS3 | VS3-T2 | Direct React component tests could not start. | The existing Vitest/Vite configuration cannot parse imported project TSX because JSX is preserved. | Removed the incompatible test files; retained pure navigation tests and verified components with the production build. | Add React/TSX transform support before adding DOM/component tests. |
| 2026-07-16 | 20:03 | VS3 | VS3-T2-R1 | Initial missing-row regression table returned 503 instead of exposing the fake-zero defect. | `it.each([[], [{}]])` expanded the arrays as argument lists, so the mock threw before production validation. | Wrapped each row set in an object and reran RED; the tests then correctly observed HTTP 200 with a false zero. | Use named cases when table values are themselves arrays. |
| 2026-07-16 | 20:06 | VS3 | VS3-T2-R1 | First production-query integration placement broke the database package build. | A database-package test imported API source outside its package boundary, creating declaration input/output collisions. | Moved the test to the API billing directory and included it from the PostgreSQL integration config. | Keep cross-layer integration tests with the consuming application, not inside a lower-level package build root. |

### MAINT-6 - CI Gate Repair

- Files changed: six Prettier-reported source/generated files, `.gitattributes`, and task records.
- Root cause: repository baseline had six files outside Prettier formatting rules; generated Next types also needed committed LF checkout behavior. No logic or generated-schema values were incorrect.
- Verification: initial `pnpm ci:check` reproduced exactly six formatting findings; after formatting, full `pnpm ci:check` passed (124 unit tests, 6 PostgreSQL integration tests, lint, typecheck, and builds).
- Decision: keep repair mechanical and scoped to Prettier output; enforce LF only for the generated Next type file whose correction otherwise has no Git diff.

---

### MAINT-9 - Landing Navigation Surface Alternation

- Files changed: `landing-page.tsx` and MAINT-9 task records.
- Decision: change only the navigation background from the charcoal page token to the existing elevated slate surface token.
- Verification: Chrome screenshot confirms contrast between navigation and hero; console is clean; Prettier, lint, typecheck, and whitespace checks pass.

---

### MAINT-10 - Landing Footer Surface Alternation

- Files changed: `landing-pricing-cta.tsx` and MAINT-10 task records.
- Decision: apply the existing `bg-rp-bg` token only to the footer so it alternates from the final CTA's `bg-rp-surface/45` surface.
- Verification: desktop and 390px Chrome screenshots plus computed styles confirm charcoal footer and elevated CTA contrast; Prettier, web typecheck, focused ESLint, and Git whitespace checks pass.
- Limitation: root `pnpm lint` exceeded the 120-second command limit after package builds while ESLint was running; focused changed-file lint passes. Chrome's existing LCP image warning remains out of scope.
- Commit: `98339d0` (`fix(marketing): alternate landing footer surface`) contains the completed source update and initial task records.

---

### VS3-T3 Operational Update - 2026-07-17 11:38 Asia/Manila

- Files changed: Checkout API/controller/service/gateway/rate-limit modules and tests; API configuration/test setup; Billing web action, CTA, safe Checkout URL validation, return notice, tests; Stripe/Arcjet dependencies; API/environment contracts; tracker and archive records.
- Decision: create only a payment-mode Stripe Checkout session in VS3-T3. Keep all database payment, customer, credit-ledger, and credit-grant writes for VS3-T4 after webhook signature verification.
- Decision: map the three public pack codes to trusted server configuration and rate-limit the authenticated user ID to three attempts per minute with Arcjet fixed-window protection.
- Verification: `pnpm ci:check` PASS - 169 unit tests (6 intentionally skipped), 6 PostgreSQL integration tests, Prettier, lint, strict typecheck, and production builds all pass.
- Failure resolved: `@arcjet/node` is ESM-only while the Nest API emits CommonJS; the integration dynamically imports Arcjet at its concrete client boundary. Typecheck and full CI pass.
- Dependency decision: pin `@arcjet/node` to `1.5.0` because its `>=20` Node engine preserves the repository's Node 22.18 support; later Arcjet releases require Node 22.21 or newer.
- Failure resolved: existing project tests load API configuration and needed safe syntactically valid Checkout environment values after configuration became fail-closed; updated their test-local environment only.
- Browser note: the Windows sandbox denied detached local dev-server startup, so no live browser session was available. Focused web boundary tests and the production build verify the UI code; live Stripe/Arcjet credentials remain required for acceptance.

---

### MAINT-11 Operational Update - 2026-07-18 12:08 Asia/Manila

- Files changed: `landing-hero-workflow.tsx` and MAINT-11 task records.
- Decision: remove only full-viewport hero height constraints, then use existing spacing tokens for a content-led layout. Preserve copy, media, CTAs, color tokens, and responsive breakpoint behavior.
- Verification: Chrome reports 628px hero height and 272px visible workflow content at 1440x900; 390x844 keeps all hero images visible; console is clean after reload.
- Verification: changed-file Prettier, focused ESLint, web typecheck, and `git diff --check` pass.

---

### VS3-T4 Implementation Checkpoint - 2026-07-18 16:44 Asia/Manila

- Files changed: API raw-body bootstrap; billing webhook controller, Stripe verification gateway, service, and database repository; API config validation; owner-authorized database migration; unit and PostgreSQL integration coverage; task records.
- Decision: fulfill only `checkout.session.completed` events that are signature-verified, complete, paid, and match one trusted credit pack's code, USD total, and server-created `client_reference_id`. All other valid signed events are persisted as ignored with no grant.
- Decision: use two `SECURITY DEFINER` owner routines with a fixed search path. The runtime role can execute only the narrow ignored-event or atomic purchase-grant operation; it cannot write the Stripe or ledger tables directly.
- Verification: focused webhook/config tests (31), API typecheck, targeted ESLint, changed-file Prettier, and PostgreSQL integration tests (7) pass. The integration suite proves a runtime grant is atomic, duplicate event delivery is a no-op, a second event for the same Checkout session cannot mint credits, and altered credit terms roll back without an event record.
- Limitation: local `.env` currently has no non-placeholder Stripe secret, webhook signing secret, or test Price IDs, so a live Checkout/CLI-forwarded webhook has not run. Full root lint and typecheck exceeded the 60-second command limit after package builds; focused checks passed.

---

### VS3-T4 Stripe Price Provisioning - 2026-07-18 17:37 Asia/Manila

- Created in the RepurposePro sandbox: three active one-time USD prices, each on its own product: Starter ($10.00, 40 credits), Creator ($25.00, 100 credits), and Pro ($50.00, 200 credits).
- Metadata: each price and product carries the matching `pack_code` (`starter`, `creator`, or `pro`) for dashboard auditability. The application continues to use its server-side trusted pack mapping rather than accepting this metadata from a client.
- Next: copy the three returned IDs only into local `.env`, then add the test secret key and CLI listener signing secret before running the live Checkout/webhook acceptance test. No secret or environment value was written to the repository.
