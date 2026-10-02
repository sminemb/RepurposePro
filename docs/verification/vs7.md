# VS7 verification — manage, regenerate and export multiple clips

Date: 2026-10-01, Asia/Manila. Work began at 21:54 on `codex/vs7-multi-clip`
from clean `main`. Task timestamps and handoff are recorded in the progress tracker.

## Delivered behavior

Initial primary clips are selected. Selection persists separately from caption revisions.
Confirmed deletion archives rows and focuses an available clip, preserving source media,
backups and downloads. Save/Discard/Cancel protects dirty drafts before deletion or replacement.
Regeneration consumes an unused backup first, preserving rank, selection and caption appearance.
Gemini fallback freezes transcript and previously offered ranges, uses the existing configuration,
and retains the original until fenced success. Failures retain the original and allow a fresh retry.
Both regeneration and rendering remain free.

A render accepts 1–10 selected saved revisions and freezes them atomically. Clips render
sequentially; successful exports become downloadable while remaining items run. Persisted
per-item progress survives refresh and reconnect. Recovery skips successful clips, caps each
item at two automatic attempts, and retains downloads after partial failure. The output page
groups attempts and retries only failed clips still selected using current saved revisions.

## Automated evidence

- Shared/API tests cover legacy and batch contracts, duplicate/missing/invalid revisions,
  complete-snapshot editing, selection/delete boundaries and authenticated contained downloads.
- Regeneration selector/processor tests cover structured responses, bounds, overlap rejection,
  untrusted transcript delimiters, bounded repair, timeout, cancellation, lease loss, fresh
  captions, terminal deduplication and original retention.
- PostgreSQL/Redis tests cover ownership and role isolation, selection persistence, revision
  conflicts, concurrent backup replacement, idempotency, exhaustion, immutable snapshots,
  zero credit changes, two failed regeneration attempts and fresh retry, whole-batch rejection,
  deselection, partial publication, takeover fences, per-item limits and output uniqueness.
- Publication rejects malformed metadata, including string `NaN`, missing paths, zero sizes,
  wrong durations and null leases, without creating output rows. Paid analysis jobs cannot be
  acquired through render or regeneration lease functions.
- The real batch test recovers a Redis publication outage and a missing FFmpeg executable,
  then renders two four-second 1080×1920 H.264/AAC MP4s from a generated six-second source.
  Both validated output files publish under distinct clip/lease paths with one output row each.
- Focused evidence: `storage/vs7-verification/final-batch-focused.log` (11 database/Redis tests)
  and focused selector/processor/shared/API checks. Final quality-gate results are recorded below.

## Browser evidence

`scripts/verify-vs7-browser.ts` bundles the production editor and output components against
synthetic API responses and real fixture media. It exercises UI behavior without sending
model requests or changing billing. Actual queue/database and MP4 behavior is tested separately.

Desktop checks verified checkbox counts, dirty Save then Delete confirmation, next-clip focus,
backup replacement, and Save then Render Selected Clips. Captured request data showed revision
4 saved as revision 5 before the batch posted revisions 5 and 7. Mobile checks use a 390×844
viewport. Pending regeneration survives reload, disables target destructive actions, and leaves
the original visible after failure. Partial failure shows completed/failed counts, a successful
download and a retry action that posts only the failed selected clip. Output polling continues
across refresh and reconnect; download URLs remain authenticated and expiration-aware.
Switching away from a regenerating clip preserves focus while the replacement finishes. Zero
selected clips disable rendering. Deselecting failed clips prevents a retry request. Deleting
the last candidate reaches the empty state while its earlier export remains downloadable.
At 390px, the page width and scroll width both measured 390px. Screenshots were inspected: 
`mobile-publishing.png`, `mobile-partial.png` and `desktop-publishing.png`.

Screenshots, request recordings and logs remain under ignored `storage/vs7-verification`.
No live Gemini call is required for these deterministic failure/recovery checks.

## Migration and recovery

Migrations 0026–0035 were applied locally before updated service execution. New deployments
must apply them before starting API/worker processes. Existing single-clip headers, output
identities, idempotency aliases and expiration dates remain compatible. Immutable request
items are backfilled alongside separate progress; legacy worker functions synchronize that
progress and reject multi-item work. Durable dispatch retries outages without additional charges.
Interrupted workers are fenced by leases and exact publication paths. Partial batches return
to preview-ready, with successful exports retained. See ADR 0005 for the lifecycle decisions.

## Final quality gate

`pnpm ci:check` passed at 23:51 Asia/Manila on 2026-10-01: formatting, ESLint,
TypeScript, 583 unit tests, 74 PostgreSQL/Redis integration tests and production builds.
The unit pass intentionally skips the 74 database tests, which then all pass in the dedicated
integration stage. The existing Next.js file-tracing warning is non-fatal.
Full evidence: `storage/vs7-verification/ci-check.log`.

Final reviews resolved late regeneration focus changes, polling tied to the active clip,
missing regeneration caption defaults, lease acquisition on unrelated jobs, publication
metadata validation and inconsistent project/job lock order. Reviews of the final editor
and output-page changes found no remaining high-confidence issues.

All VS7-T1 through VS7-T7 are complete, with actual start/end timestamps in the tracker.
No additional dependencies or environment variables are required. Summary rendering, broader
refund handling and scheduled file deletion remain in VS8, VS9 and VS10 respectively.
