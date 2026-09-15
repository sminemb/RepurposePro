# ADR 0002: Source-timed clip edits with explicit saves

- Status: Accepted
- Date: 2026-09-14
- Owners: RepurposePro engineering

## Context

VS5 allows a user to extend a generated clip anywhere within its source video. Recomputing caption
timing on every trim would move edited text and lose captions when a trim is shortened. Multiple tabs
can also edit the same candidate.

## Decision

All preview timestamps are absolute source-video seconds. `caption_baseline` is a stable array of
identified source-timed lines, initialized from the original generated lines plus transcript phrases
outside the original range. Transcript phrases contain up to seven words and use evenly divided
segment timing, matching the existing phrase-level preview approach. No new transcription occurs.
Legacy generated lines are intersected with transcript speech intervals so fallback captions cannot
bridge silence.
The baseline is computed for reads and cached atomically on the first save. Its line IDs and timing
are server-controlled; subsequent saves never reconstruct it from a shortened clip.

`caption_edits` stores text and highlight overrides by baseline line ID, including edits outside the
current trim. `caption_lines` remains the materialized visible projection: intersect the baseline with
the trim, apply overrides, and keep transcript gaps empty. This preserves the existing list/player
contract while allowing a later render worker to read the same saved projection. Editable projections
allow up to 100,000 lines instead of silently truncating long trims at 200.

The client previews local drafts immediately and saves explicitly. Every save includes
`expectedRevision`; the database locks the owned project and candidate, checks the current job and
revision, validates the entire edit, updates metadata, and increments `edit_revision`. Competing saves
receive `409 CLIP_EDIT_CONFLICT`. The runtime role receives execute privileges on ownership-scoped
functions, never direct table update privileges. No queue, credit, or render operation is involved.

Drafts use session storage scoped by user, project, and clip. Save/discard clears the draft, and
sign-out clears that user's editor drafts. Application links, clip switches, and form submissions
offer Save / Discard / Cancel; refresh/close uses the browser's native warning. Browser-history
transitions that cannot reliably be blocked retain a recoverable draft. Restoring a draft against a
newer revision requires the user's explicit Restore action and a reminder to review before saving.

## Consequences

- Apply migrations 0021 and 0022 before deploying the new API and editor. Existing worker inserts
  remain compatible: baseline is nullable, edits default to an empty array, revision defaults to zero.
- Rolling application code back can retain the additive columns/functions and saved metadata. Do not
  drop them as an application rollback step.
- The PATCH endpoint accepts a complete editable snapshot and at most 2,000 overrides, with 160
  characters per caption and 10 highlights of at most 64 characters per line. JSON bodies are bounded
  to 2 MiB; raw webhook-body handling remains enabled.
- Playback and future rendering must subtract trim start only when converting source timestamps into
  an output-relative subtitle timeline. They must not rewrite the stored baseline or overrides.
- VS5 keeps the current crop and Hormozi style. Font sizes use a 1080-pixel reference width; the browser
  scales them with its video container. The later render slice must use the same reference.

## Verification

Shared and API tests cover validation, projection, escaped highlights, and revisions. PostgreSQL
integration tests cover owner isolation, direct-write denial, competing saves, atomic rejection, and
baseline preservation through shrink/extend saves. See [VS5 verification](../verification/vs5.md)
for browser scenarios and quality-gate evidence.
