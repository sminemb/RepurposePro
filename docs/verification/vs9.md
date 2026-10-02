# VS9 verification — automatic refunds and failure recovery

Date: 2026-10-02, Asia/Manila. Started at 20:35 from clean `main` on
`codex/vs9-failure-refunds`. Actual task start/end times are in the progress tracker.

## Delivered behavior

A valid, durably saved clip or summary preview fulfills paid analysis. Before that boundary,
terminal eligible failure refunds the exact deduction once. PostgreSQL verifies the paid job,
deduction, immutable reason, execution lease and absence of a completed preview; the refund
ledger and job/project state commit together. Successful analysis, cancellation, free rendering
and regeneration do not receive analysis refunds. See [ADR 0007](../adr/0007-paid-analysis-refunds.md).

Persisted lease-fenced budgets allow two transcription-stage attempts and three Gemini calls
per paid selection. Transport retries and response repairs share the selection budget. Attempts
are counted before external work and survive takeover. Backoff is abortable, transcripts are
reused, temporary audio paths include the lease/attempt, and lease loss stops stale execution.
Workers persist specific terminal intents; API sweepers settle credits. Queue events and stale-job
reconciliation recover missed signals. Durable transcript/preview checks handle lost publication
responses without refunding fulfilled analysis.

Settled refunded projects can start another paid analysis from a retained usable upload. Source
metadata and the actual file are checked before charging. Atomic start creates a new job,
deduction, dispatch and budgets; duplicate starts return that job. Historical refund replays
verify the old ledger and cannot modify a newer job. Pending settlement blocks paid restart.

The ownership-scoped status contract exposes only safe failure messages and a nullable failure
object. Confirmed amounts/timestamps come from the persisted refund ledger. The processing page
shows pending settlement, continues polling until confirmation, refreshes the balance on
settlement, and links to the existing billing transaction-history section. Retry reveals current
cost/balance before explicit confirmation, then refreshes balance and resumes new-job polling.
Unavailable uploads and insufficient credits prevent confirmation.

## Automated evidence

The dedicated `analysis-refunds.postgres.integration.spec.ts` runs 20 deterministic scenarios
through the real worker pipeline, PostgreSQL execution lifecycle, persisted budgets, API sweeper
and status service. External FFmpeg/Whisper/Gemini operations are controlled fixtures. Both clip
and summary modes cover Whisper failure/timeout, extraction failure, Gemini transport exhaustion,
invalid output exhaustion, storage failures and worker failure recovery. Before settlement,
the specific reason is pending and no refund exists; afterwards exactly one full 11-credit
refund exists. Cross-user reads fail and conflicting late reasons cannot overwrite it.

Successful automatic retry produces one deduction and no refund. Valid partial clip selections
publish successfully despite exhausting the selection budget. A committed preview whose response
is lost is recognized as successful. Existing reliability/integration tests also verify concurrent
terminal events, missed queue events, API restart, lost finalization markers, valid/expired leases,
takeover budgets, stale publication, duplicate starts, insufficient credits, pending settlement,
expired uploads, historical replay, immutable ledger and restricted financial identities. Free
render/regeneration suites remain in the full gate.

Focused logs are under ignored `storage/vs9-verification`, including `worker-refund.log`,
`financial-boundary.log`, `last-focused-db.log`, `last-focused-lint.log` and `final-focused.log`.

## Browser evidence

`scripts/verify-vs9-browser.ts` bundles the production processing/restart components with real
production CSS and deterministic API responses. Chrome DevTools verified pending-to-completed
settlement, exact confirmed amounts, polling stopping after settlement, one settlement-triggered
page refresh, and the valid `/billing#credit-history-title` link. Reviewing cost sends metadata,
balance and source HEAD requests only. Explicit confirmation sends one `{confirmed:true}` paid
start and replaces the old failed job with a new queued job; balance refresh follows restart.

Desktop checks use 1440x900. At 375x812 the document width equals the viewport, cost cards stack,
buttons are at least 44px high, and one polite announcement reports the failure/refund transition.
Keyboard navigation reaches history/retry and focuses the cost heading when review opens.
Unavailable-source and insufficient-credit states explain recovery and omit a charge button.
The healthy workflow has no console errors or warnings; the unavailable fixture intentionally
returns HTTP 404. Screenshots, accessibility snapshots and request recordings are saved under
ignored `storage/vs9-verification/browser`, including `pending-desktop.png`,
`completed-desktop.png`, `confirmation-desktop.png`, `confirmation-mobile.png`,
`unavailable-mobile.png`, `pending-final.txt`, `completed-final.txt`,
`settled-poll-evidence.json` and `final-workflow.json`.

This browser evidence exercises real components against a fixture, not an authenticated live
deployment. Database/auth/refund boundaries are verified separately by the integration gate.
No paid live AI call is required to reproduce these deterministic failure scenarios.

## Migrations and quality gate

Forward migrations 0040–0043 were applied locally before updated service startup. Integration
fixtures apply the complete migration history, verify role confinement, and restore configured
database roles on completion. Deployment must migrate before starting updated API/worker code.
No dependencies, required environment variables or credentials were added. Scheduled deletion
and broader security hardening remain VS10 and VS11.

Final validation at 21:57 Asia/Manila: `pnpm ci:check` passes formatting, lint, TypeScript, 633 unit tests,
110 PostgreSQL/Redis integration tests and all production builds. The unit stage intentionally
skips database tests, which pass in the dedicated stage. The existing Next.js file-tracing
warning remains non-fatal. Full log: `storage/vs9-verification/ci-check-final.log`.

Reproduce with `pnpm install --frozen-lockfile`, `pnpm infra:up`, `pnpm db:migrate`, and
`pnpm ci:check`. After the web build, run
`node node_modules/tsx/dist/cli.mjs scripts/verify-vs9-browser.ts` for the browser fixture.
All six tasks completed at 21:57 Asia/Manila. Verified milestones use Conventional Commits.
No requested check is intentionally left unfinished.
