# ADR 0003: Follow one person and persist caption colors

- Status: Accepted
- Date: 2026-09-28

## Decision

Extend ADR 0002's explicit-save editor with moving framing and caption colors. A clip's
`framing` contains `mode` (`follow` or `manual`), an optional `trackId`, normalized `offset`,
and normalized `manualCenter`. A null stored framing preserves legacy crop behavior. New
clips default to following the most consistently visible, prominent face in their trim.
The largest possible 9:16 crop stays within source bounds with fixed size. Near an edge,
the source boundary takes precedence over exact face centering.

The worker samples the source at five frames per second using MediaPipe 0.10.32 and the
checksum-pinned BlazeFace short-range float16 model, version 1. FFmpeg applies rotation;
display dimensions include sample aspect ratio. Association uses predicted motion, box
overlap, and size. Ambiguous matches are withheld; matching is abandoned after 1.2 seconds.
Users may select another detected track. This is local geometric tracking, not identity
recognition or active-speaker detection across camera cuts. A three-sample filter smooths
positions. Preview interpolation covers gaps up to 0.6 seconds; larger gaps hold the last
reliable position. There is no automatic zoom.

`video_framing` caches source-timed tracks by source ID and tracker version. New analysis
requests tracking before preview finalization. Existing videos can request tracking with
`POST /projects/:projectId/framing-analysis` and poll the corresponding GET. Requests are
ownership-scoped and do not charge credits, change the current analysis job, or transcribe.
A database-backed dispatcher feeds a dedicated BullMQ queue; duplicate execution is fenced
by a 20-minute database lease and token. Detector execution is bounded to 15 minutes.
Failed work is explicitly retryable. Empty completed results have a 30-second retry cooldown.
Completion updates only generated data, never clip revisions or user edits.

Caption text defaults to `#FFFFFF`; highlights default to `#c4522a`. `captionTextColor`
is clip-wide. `highlightColors` maps lowercase, trimmed highlighted phrases to six-digit
hex colors. Existing whole-phrase, Unicode-aware, longest-match-first rendering remains.
Omitted fields from older saves retain saved settings and colors for retained highlights.
All changes participate in revision checking, draft recovery, Save, and Discard.

## Setup and deployment

1. Create an isolated Python environment with `python -m venv .venv/framing`.
2. Install `apps/worker/python/requirements-framing.lock.txt` using that environment's pip.
3. Run `python scripts/setup-framing.py` from the repository root. This verifies SHA-256
   `b4578f35940bf5a1a655214a1cce5cab13eba73c1297cd78e1a04c2380b0152f` before saving the model.
4. Set `FACE_PYTHON_PATH` to the environment's Python executable and optionally
   `FACE_MODEL_PATH`; it defaults to `<STORAGE_ROOT>/models/blaze_face_short_range.tflite`.
   Relative configured paths resolve from the workspace root. `FACE_TIMEOUT_MS` defaults
   to 900000. FFmpeg and FFprobe must be available through their existing settings.
5. Apply migrations 0023/0024 before starting the updated API and worker. Restart the web app.

Keep generated media, models, and Python environments untracked. Missing dependencies
produce a retryable tracking failure while manual framing remains usable. Monitor
`framing_completed`, `framing_failed`, and `framing_analysis_fallback`, including duration,
track count, and fallback rate. Rollback may retain the additive tables and columns; do not
drop user edits. The previous application's strict schemas cannot read new colored edits,
so an application rollback requires a compatibility build rather than blindly reverting it.

Final MP4 rendering is still a later slice. It must use the same source timestamps, fixed
crop geometry, interpolation, and caption colors to match the preview.

## Verification

Shared tests cover aspect ratio, boundaries, interpolation, gaps, track choice, and colors.
Python tests cover motion association, ambiguous crossings, short gaps, rotation, and pixel
aspect ratio. Database integration covers ownership, atomic rejection, revision conflicts,
legacy saves, cache deduplication, and worker fencing. Browser verification uses the real
editor with a local fixture API; database persistence is verified separately against PostgreSQL.
