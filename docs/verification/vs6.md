# VS6 verification — one saved vertical clip

Date: 2026-09-30, Asia/Manila. Work began at 21:20 and completed at 23:33.
Scope is VS6-T1 through VS6-T8; ADRs 0002, 0003 and 0004 apply.

## Delivered behavior

The editor explicitly saves a dirty draft before requesting one clip render, using
the revision returned by the save. Conflicts, validation failures and edits arriving
during saving prevent enqueueing. Render attempts are free. Previous successful
outputs remain downloadable until their individual expiration dates, including when
a later attempt fails. Rendering preserves editor and preview access through the
separate current-analysis reference.

The API freezes saved captions, trim, styling, source identity and effective tracking
in an immutable request. A project lock serializes concurrent requests; matching
active requests share work and retain all accepted idempotency keys. Durable dispatch,
deterministic queue IDs and fenced leases recover queue outages and allow one retry.
Progress reaches 100 only when output metadata and job completion commit together.
Downloads authorize ownership and retention before opening a contained storage file.

## Automated checks

- Unit/API coverage includes one-clip validation, actual saved revision sequencing,
  conflicts, Unicode phrase matching across wrapping and uppercase expansion,
  subtitle escaping/timing/colors, framing commands, progress parsing, and real-file
  download headers and containment.
- PostgreSQL/Redis coverage includes ownership isolation, runtime/processing role
  permissions, concurrent requests and idempotency aliases, immutable snapshots,
  source expiration, pending/failed tracking, preview access after changing the
  current job, lease takeover/fencing, retry exhaustion, exact-path completion
  replay, unique outputs, publication expiration and free re-renders.
- A real Redis outage remains durable. A missing FFmpeg executable fails the first
  execution; the retry renders and publishes one playable MP4 with no duplicate row.
- Final quality gate: `pnpm ci:check` exited 0; see `storage/vs6-verification/ci-check.log`. The full gate covers
  formatting, lint, typechecking, 547 unit tests, 68 PostgreSQL/Redis integration
  tests and production builds. An intermediate run passed all assertions but reported
  PostgreSQL idle-connection termination during forced test-database cleanup; that
  run is preserved as `ci-check-cleanup-race.log` and prompted a complete rerun.
  The rerun passed all 68 integration tests without cleanup errors.

## Real-media evidence

Run `pnpm exec tsx scripts/verify-vs6-media.ts` from the repository root. Fixtures and
evidence remain under ignored `storage/vs6-verification`, following the repository's
runtime-storage convention. Each fixture includes source media, frozen preview data,
ASS, file-backed crop commands, an MP4 and an extracted PNG. The fractional source
trim is 0.125–2.525 seconds. Fixture encoding uses `veryfast` to keep verification
short; production defaults remain preset `medium`, CRF 20 and a 60-minute timeout.

| Fixture | Coverage | Duration | Size (bytes) |
| --- | --- | --- | --- |
| manual | Manual framing with boundary clamping; three caption colors | 2.400000 s | 2,006,089 |
| follow | Moving tracking, long gap holding the previous sample, offsets | 2.400000 s | 1,857,803 |
| portrait | Portrait source geometry | 2.400000 s | 1,255,516 |
| anamorphic | Non-square source pixels, SAR 16:15 | 2.400000 s | 954,582 |
| disabled | Captions disabled | 2.400000 s | 912,538 |
| rotated | Source rotation metadata of 90 degrees | 2.400000 s | 780,098 |

FFprobe confirms every output is 1080×1920, square pixels, H.264 video and AAC audio.
FFmpeg decodes the outputs to PNG evidence; audio is generated from a sine fixture.
All duration checks pass within 0.12 seconds. Sources include long Unicode text,
literal braces and literal ASS controls, fractional trims and caption silence gaps.
The frozen framing uses centered fallback for failed/empty tracking and holds the
prior effective sample through long track gaps, matching the preview.

`evidence.json` records dimensions, codecs, durations and sizes. Reference SHA-256:

```text
manual/output.mp4 ADB56D04161EB242831E7CDA678949AAFA3905E8287A63ADE9CF51BEFAFE2FB7
follow/output.mp4 14B7BC35865B45BC069DF7252E3569B17798A249D353E028CA2D76BED12BC4C5
```

## Browser evidence and parity

After building the web app, run `pnpm exec tsx scripts/verify-vs6-browser.ts` and open
`http://127.0.0.1:4316/`. This loopback fixture runs the production preview, editor
save hook, render action and output browser with synthetic responses and the built
web stylesheet. It does not exercise a signed-in hosted session or external AI.
Authorization and persistence are exercised by the API/database tests above.

- In `?editor=1`, changing caption size to 72 and clicking **Save and render** sends
  PATCH with revision 4, waits for the delayed response at revision 7, then sends POST
  render with revision 7. `requests.json` preserves the observed request order.
- Completed outputs show title, 2.4-second duration, size, expiration, download and
  return-to-editor actions (`browser-outputs.png`).
- Queued, preparing, rendering, saving-output, completed and failed responses were
  inspected. Rendering displays 42% (`browser-progress-final.png`), saving-output
  displays 97%, and failure preserves the earlier downloadable output.
- Preview/export frame comparisons use the same source timestamp of 0.625 seconds
  (output timestamp 0.5 seconds). `browser-manual.png` and `browser-follow.png` compare
  against each fixture's `frame.png`. Static color-bar boundaries differ by two
  output pixels for manual framing and zero pixels for moving follow framing.
- The tracking-gap comparison uses source 1.625 seconds/output 1.5 seconds:
  `browser-follow-gap.png` against `follow/gap-frame.png`. The magenta boundary is
  x=256 in both; cyan is x=825 in the browser and x=826 in the export.
- At source 1.125 seconds/output 1.0 seconds, the first caption is absent in both
  preview and `follow/caption-end.png`. At source 1.425 seconds/output 1.3 seconds,
  the next long caption is present in both preview and `follow/caption-start.png`.
  The intervening silence remains empty. Timing tolerance is ASS centisecond
  precision plus one 30 fps video frame; crop tolerance is two output pixels.

Browser and libass use identical licensed Inter 4.1 Black bytes (pinned SHA-256 in
the font README), uppercase text, shared wrapping and per-highlight colors. The
caption backing matches position and dimensions. The ASS font-size correction
matches CSS ascent/descent; observed glyph edges/kerning differ by roughly 1–3
pixels because browser and libass rasterization differ. This does not change the
measured crop tolerance. Literal subtitle controls render as text rather than
newlines or ASS drawing commands.

## Operational handoff

Migration 0025, including its Drizzle snapshot, adds the current-analysis pointer,
immutable requests, idempotency aliases and rendered outputs with narrowly granted
database functions. `pnpm db:migrate` successfully applied it locally. Apply it
before deploying the updated API and worker. New dependency: worker
`@napi-rs/canvas` pinned to 1.0.9. The font and SIL Open Font License are bundled in
shared assets and web public assets.

Validated environment settings are documented in `docs/env-reference.md`:
`FFMPEG_PRESET=medium`, `FFMPEG_CRF=20`, `RENDER_TIMEOUT_MS=3600000`, and
`FILE_RETENTION_DAYS=7`. Retention begins at publication. Font overrides must retain
the pinned font hash. Existing Next.js file-tracing warnings are non-fatal.
Scheduled deletion remains VS10; summary exports, multi-clip requests, refund
expansion and output deletion UI remain outside VS6.
