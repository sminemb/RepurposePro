# ADR 0006 — Saved chronological summaries and source-shaped exports

Date: 2026-10-02. Status: Accepted for VS8.

Summary mode needs one coherent chronological video rather than ranked vertical clips.
It must preserve the original picture and speaker audio, permit reversible edits, and remain
safe across concurrent saves, queue outages, crashes and repeated delivery.

The existing paid analysis loads project mode from a lease-fenced database function after
cached local Whisper transcription. Summary mode uses `summary-v1`, transcript-only structured
selection, independent strict validation and bounded complete-response repair. Generated totals
must be 8–12% of source duration, targeting 10%. Empty speech and invalid selections publish no
partial metadata. Summary work skips clip selection, captions and face tracking.

Summary state belongs to an analysis job, with one summary-wide revision. Segment IDs and
ordering are stable; uniqueness is analysis-scoped so later analyses preserve earlier rows.
Atomic finalization checks current analysis and execution lease before completing the preview.
Owned complete-snapshot saves validate all IDs, millisecond source bounds and selected neighbor
chronology. Removal retains rows as unselected. Restoration applies the same validation.
Manual duration is unrestricted, including a saved empty selection; rendering requires selection.

Rendering freezes saved revision, analysis identity, selected ranges and source identity in an
immutable request. Acceptance stores the free job and durable dispatch atomically. Mutable
attempt/progress state stays separate. The shared render queue retains concurrency one;
summary execution uses its own lease and caps automatic work at two persisted attempts,
including takeover. Later saves affect future exports only. Failures retain the editable
summary and previous downloads; a fresh request permits another free attempt.

FFmpeg pairs trim/atrim and timestamp resets for every selected range before chronological
concatenation. Default autorotation, square pixels and even dimensions preserve source display
aspect ratio. H.264/AAC MP4 output retains original audio without generated narration or captions.
Bounded subprocesses run in private staging and abort on lease loss. Media validation checks
codecs, dimensions, selected duration and positive file size before fenced publication.

Summary outputs have a null clip reference and source-shaped dimensions. Existing clip output
constraints remain unchanged. A partial unique index permits one summary output per render job;
job/lease-specific private paths prevent an old worker replacing a newer result. Existing
authenticated contained downloads sanitize names and enforce seven-day publication-relative
expiration. Broader refund changes and scheduled file deletion remain VS9 and VS10.

We reuse source video for browser preview rather than pre-rendering draft summaries, preserving
metadata-first cost and responsiveness. Complete snapshots and one revision simplify neighbor
validation compared with independent segment writes. Separate immutable summary requests avoid
overloading clip caption/framing snapshots. The model-facing schema uses supported structural
fields while independent validation retains stricter count/reason limits; live-model smoke is
recorded separately from deterministic failure tests.

Apply migrations 0036–0039 before updated API/worker startup. They add summary tables/functions,
broaden output/request-key job references, retain clip constraints and add summary publication
uniqueness. No environment, credit-ledger or existing output backfill is required. The optional
`GEMINI_SUMMARY_MODEL` override defaults to the configured clip model. See
[verification](../verification/vs8.md) for actual acceptance evidence and limits.
