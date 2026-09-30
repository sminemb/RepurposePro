# ADR 0004: Saved one-clip exports

Date: 2026-09-30 (Asia/Manila). Status: Accepted.

VS6 exports exactly one primary clip per explicit request. The editor saves a dirty
draft first and sends the revision returned by the save. Conflicts, validation
errors, recovery drafts and changes arriving during saving prevent enqueueing.
Rendering and re-rendering charge zero credits. Completed attempts remain available
until their individual expiration dates; render failures preserve editable previews.

`current_analysis_job_id` preserves the analysis used by editor and preview queries,
while `current_job_id` identifies current processing/render work. Migration 0025
backfills existing analysis references and remembers new analysis jobs.

The ownership-scoped database function locks the project and clip, checks revision,
readiness and source retention, freezes projected captions and effective tracking,
then inserts the job, immutable request and durable dispatch atomically. Accepted
idempotency keys, including aliases for matching active work, remain bound to that
attempt after completion or failure. A new key after completion starts a free render.

The render queue uses deterministic database job IDs, concurrency one and two
execution attempts. The dispatcher recovers queue outages and respects valid database
leases. A 60-second token-fenced lease, renewed every two seconds, controls progress,
failure and publication. Losing the lease aborts media subprocesses. Progress stays
below 100 until an output row and job completion commit together.

The worker uses argument arrays, bounded output/timeouts, private attempt directories
and file-backed crop commands. Source rotation and sample aspect ratio normalize
before cropping; cropping occurs in output-sized pixels to bound integer rounding.
Crop commands use ADR 0003 geometry at each 30 fps output timestamp, with a small
command-time epsilon to avoid rounding a command past its target frame. Video and
audio timestamps reset together. FFprobe validates the final 1080×1920, H.264/AAC,
square-pixel MP4 before attempt-specific publication.

Caption projection follows ADR 0002. Shared Unicode phrase matching happens before
wrapping, including uppercase expansions, and shared layout uses a 1080 px reference.
Both browser and libass use the pinned, licensed Inter 4.1 Black asset. The ASS font
size compensates for Inter's full ascent/descent metrics; explicit line positions
and rounded drawing events match the browser backing. Literal ASS controls are
escaped with a zero-width separator after backslashes. Browser and libass glyph
rasterization and kerning can differ by a few pixels even with the same font.

Publication paths include job and lease token. Completion replay and ambiguous-response
cleanup check that exact path, so stale attempts cannot retain another attempt's
output. Downloads authorize before resolving storage, validate containment and file
size, and stream with private caching and a sanitized attachment filename. Public
output metadata never includes paths. Retention starts at successful publication,
defaults to seven days, and scheduled deletion remains VS10.

See [VS6 verification](../verification/vs6.md) for tests and media/browser evidence.
