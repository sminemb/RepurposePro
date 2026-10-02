# VS8 verification — complete summary-video workflow

Date: 2026-10-02, Asia/Manila. Work began at 12:32 from clean `main` and is on
`codex/vs8-summary-video`. Actual task timestamps are recorded in the progress tracker.

## Delivered behavior

Summary analysis reuses cached local Whisper, paid-analysis leases/progress and failure handling.
Trusted project mode selects the `summary-v1` branch, skipping clip selection, captions and
tracking. Generated selections target 10% of source duration and require 8–12%, source bounds,
chronology, non-overlap and bounded reasons/count. Empty speech and exhausted repairs produce
no partial metadata. The optional summary model defaults to the configured clip model.

Current-analysis summaries have stable segment IDs/order and a summary-wide revision. Complete
saves validate atomically; removal retains unselected rows and restoration validates neighbors.
Manual duration is unrestricted. Browser preview plays individual ranges or skips source gaps
continuously; seeking maps summary time to source time. Save/Discard, conflict recovery,
navigation protection and recoverable drafts precede saved-revision rendering.

Free rendering freezes revision, analysis, source identity and selected ranges with durable
dispatch. The shared render queue retains concurrency one. Two persisted attempts cap automatic
execution across crashes/takeover. FFmpeg trims matching video/audio, resets timestamps and
concatenates chronologically into source-shaped, rotated-normalized, square-pixel, even-dimension
H.264/AAC MP4. Lease cancellation and fenced publication prevent stale or duplicate outputs.
Failures retain edits and previous downloads. Authenticated contained downloads expire seven
days after publication. Broader refunds and scheduled file deletion remain VS9/VS10.

## Automated evidence

- Shared selection tests cover 8%/12% boundaries, malformed/empty responses, invalid timestamps,
  chronology/overlap, millisecond normalization, count/reason limits, instruction-like transcript
  escaping and summary-to-source seeking. Selector tests cover bounded repair/exhaustion,
  empty speech, timeout transport failure and cancellation.
- Pipeline tests verify trusted summary mode, replay/finalization fences and absence of clip,
  caption or face work. Existing transcription cache, paid failure/refund and clip tests remain
  part of the full gate.
- Summary PostgreSQL/Redis tests cover ownership and restricted roles, atomic competing saves,
  removal/restoration, saved empty selections, source expiry, immutable revisions and key
  bindings, zero render charges, replay uniqueness, persisted attempt limits, lease takeover,
  stale publication, malformed metadata, download authorization and expiration.
- Later analysis keeps its own revision/order/IDs, retains earlier summary rows and rejects old
  IDs in new saves. All 86 database/Redis integration tests passed at 13:34; log:
  `storage/vs8-verification/db-integration.log`.
- Real-media fixtures publish a two-second 640x360 summary and a three-second retry. Audio
  zero-crossing measurements verify the original 440Hz context precedes the original 880Hz
  conclusion. A rotated source with non-square pixels produces an even, square-pixel output
  with matching display aspect and no residual rotation.
- Actual Redis publication outage retains durable work; a missing FFmpeg executable consumes
  one attempt, then restored execution publishes exactly one output on attempt two. Unit tests
  verify subprocess abortion on lease loss and cleanup after failed publication.
- Focused evidence lives in `summary-media.log`, `renderer-fences.log` and `focused.log` under
  ignored `storage/vs8-verification`.

## Browser evidence

`scripts/verify-vs8-browser.ts` bundles production editor/output components against synthetic
API responses and real fixture MP4s. Queue/database/auth/media correctness is tested separately.
Chrome DevTools checks verify individual/continuous preview, source-gap jumps, summary seeking,
extension/shortening, removed-card restoration validation, Save/Discard/Cancel, recovered drafts,
conflict-safe reload and save-before-render. Recorded requests show revision 0 saved to revision
1 before rendering revision 1. Export pages display summary failures, retained downloads, free
retry of the latest saved revision and expiration without a download link.

At 390x844 the viewport and document width both measure 390px. Controls are at least 44px high;
the source/list stack without horizontal overflow. Inspected screenshots and request recordings
remain under ignored `storage/vs8-verification`.

## Live model smoke

`scripts/verify-vs8-live-model.ts` sends only a synthetic 100-second transcript fixture, without
changing projects or billing. At 13:27 the configured `gemini-3.5-flash-lite` returned one valid
10-second selection with `summary-v1` in 9.85 seconds. Result:
`storage/vs8-verification/live-model.json`. Initial smoke rejected a large bounded array schema
with HTTP 400 `INVALID_ARGUMENT`; a supported structural schema passes while independent
validation retains strict cardinality/reason limits. Deterministic tests cover failures separately.
This smoke establishes API compatibility and validation, not editorial quality on real speech.

## Migration and final quality gate

Migrations 0036–0039 were applied locally. Deployments must migrate before updated API/worker
startup. Existing clip references/dimensions, free rendering, paid-analysis credit handling,
idempotency and previous output expiration remain compatible. No new runtime credentials or
required environment variable is introduced. See [ADR 0006](../adr/0006-summary-video-lifecycle.md).

Final `pnpm ci:check` is pending. Completion requires formatting, lint, typecheck, unit/integration
tests and production builds. Final evidence will be recorded in
`storage/vs8-verification/ci-check.log` before VS8 is marked complete.
