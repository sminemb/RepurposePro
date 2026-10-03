# ADR 0008 — File retention with fenced cleanup

Date: 2026-10-02. Status: Accepted for VS10.

## Context

Private media consumes disk after its useful lifetime. Expiration must immediately stop access
and new work without deleting files that a valid worker still needs. Filesystem removal and
PostgreSQL confirmation cannot form one transaction, so both must tolerate crashes and retries.

## Decision

Keep existing source/output deadlines. Sources expire seven days after accepted upload; each
export expires seven days after publication. `FILE_RETENTION_DAYS` changes future deadlines
only, defaults to seven, and accepts 1–365 days. Editing and transcript metadata remain retained.

An indexed `storage_cleanup_targets` registry records ownership, exact private asset path,
deadline, tombstone, writer/cleanup tokens and leases, attempts and retry eligibility. Source
and output triggers backfill/promote registered assets without extending existing deadlines.
Upload staging, replacement/source directories, extracted audio and render attempts register
before writes. Audio inherits source expiry; abandoned staging gets its own creation deadline.
Normal immediate temporary-file removal continues.

Project row locks serialize cleanup claims with execution/upload/framing acquisition. Expired
sources reject new execution leases. Existing valid execution leases can finish and publish;
cleanup waits for them. Five-minute cleanup leases fence renewal/confirmation. Reused failed
upload source paths reject outstanding cleanup claims, then re-arm only after safe completion
or release. An expired cleanup claim is recoverable by another token; its former owner cannot
confirm deletion. Missing files count as success after safe path validation.

The worker registers BullMQ Job Scheduler `expired-media-hourly` on `cleanup-queue`, runs
`cleanup_expired_project_files`, and enqueues a startup sweep deduplicated by UTC hour. Defaults:
cron `0 * * * *`, UTC, 100 targets, concurrency one per worker. Each queue execution allows four
total attempts with exponential backoff starting at 30 seconds. Later sweeps recover backlog,
deferred assets and exhausted queue deliveries. Runs log counts and asset IDs, never user-facing
private paths. Restricted functions expose only media operations and safe aggregate counts;
cleanup adds no financial write grants.

Validate lexical containment, computed owner/project layout, every resolved ancestor and all
descendants. Reject symlinks/junctions, project-root deletion and unrecognized asset layouts.
Only source directories and individually recognized audio, exports and temporary directories
are removable. Recursive inspection has a 10,000-entry safety cap; overlarge assets fail safely.
Legacy orphan scanning is bounded, rotates directory windows, and requires recognized layouts,
at least seven days since the later of birth/modification time, and no active owner. This includes
old six-character render attempt suffixes and source backup directories. Models, fonts, logs
and unrelated storage are excluded. Preview media inside the source asset expires with it;
the current implementation generates browser previews from source plus retained metadata.

Source and export APIs enforce `deadline <= now` before filesystem access and keep owner-visible
tombstones. Retention never deletes accounts, projects, jobs, payments, ledger entries, refund
intents, transcripts, saved previews or render request history. Queued/recovering expired-source
analysis records an existing terminal failure intent; existing VS9 sweepers settle any eligible
refund. Cleanup itself never initiates a charge/refund. Later exports remain available.

## Alternatives and consequences

Deleting whole project trees would incorrectly erase later exports and active work. Age-only
filesystem scanning lacks reliable ownership/deadlines. A queue-only lease cannot survive
delivery loss or coordinate with PostgreSQL publication. Durable asset targets cost extra rows
and migration complexity, but provide auditable, repeatable cleanup. Logical expiration remains
immediate while physical removal waits for the next eligible pass. Forward migrations 0044–0046
must run before updated services; rolling back code does not reverse tombstones or restore files.
