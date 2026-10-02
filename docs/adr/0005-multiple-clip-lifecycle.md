# ADR 0005 — Durable multiple-clip management and exports

Date: 2026-10-01. Status: Accepted for VS7.

The editor needs independent selection, reversible deletion, replacement of individual
slots, and batch exports without additional processing charges. Existing output references
must survive candidate changes and worker recovery.

Candidate selection is persisted separately from edit revisions. Initial live primaries
are selected; backups and archived rows are unselected. Deletion and replacement archive
rows, and live rank uniqueness allows the replacement to retain its slot. Candidates always
belong to `current_analysis_job_id`, even when a render or regeneration becomes the current job.

Ownership-scoped database functions serialize mutations under the project lock. Backup
replacement archives and promotes atomically, retaining selection and caption appearance.
Idempotency records bind each request to its target and saved revision. Exhausted backups
create a zero-credit job and immutable transcript/exclusion snapshot with durable dispatch.
A dedicated processor shares the analysis queue, but uses its own lease and failure lifecycle.
The original stays visible until success passes lease, analysis identity and revision fences.
The `clip-regeneration-v1` prompt treats transcript text as data and applies source bounds,
bounded repair attempts, and the existing 80% overlap-of-shorter exclusion rule.

Render requests freeze every selected clip in one transaction. Immutable request items are
separate from mutable progress. The legacy request header and retry-key aliases remain valid;
existing single-clip requests and outputs are backfilled without changing identity. Legacy
worker entry points accept only one-item requests and synchronize progress.

Batch processing is sequential. Each item publishes independently to a job/clip/lease path,
after media and database metadata validation. Unique job/clip output identity prevents duplicate
publication. A first failed attempt does not stop other clips; unfinished items retry after
the queue backoff. Persisted item attempts cap automatic work at two, including lease takeover.
Recovery skips successful items and retains their downloads. Once all items are terminal, the
job completes only if all succeeded; partial failure returns the project to preview-ready.

Selection and caption saves during rendering affect future exports. Accepted snapshots stay
immutable. Deletion and replacement are blocked while render work is active; target caption
saves are blocked during regeneration. Render and regeneration never write the credit ledger
and remain outside the paid-analysis refund lifecycle.

Apply migrations 0026–0035 before starting updated API/worker services. Their ordering adds
selection, lineage, owned mutations, regeneration requests, per-item render requests/progress,
legacy compatibility, validation/fencing corrections, and nested owned job status. Existing
outputs keep their paths, expiration dates and authenticated download behavior. Scheduled file
deletion remains VS10; summary videos remain VS8 and refund expansion remains VS9.
