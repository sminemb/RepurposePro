# Project and bulk clip deletion

Release date: 2026-10-17, Asia/Manila.

Dashboard cards have a bottom-right trash action with confirmation. Project deletion hides the
project immediately and durably schedules its files for cleanup. Upload writers and pending
processing/framing prevent deletion. Billing and ledger history remain.

The clip editor provides a separate deletion selection, Select all, Clear selection, and one
confirmed batch request. Batch validation is atomic, includes saved revisions, and preserves the
source and previous exports. Export selection is independent.

## Verification

- Unit suite: 915 passed; database-dependent tests are covered by the separate integration run.
- Database/Redis integration: 137 passed across 14 suites, including deletion, cleanup retry,
  framing/deletion serialization, ownership, revision conflicts, and expiration compatibility.
- New production-built browser scenarios: 2 passed. Covered subset and all-five deletion,
  cancellation, unsaved edits, mobile selection, retained exports, card placement, keyboard focus,
  busy-project errors, physical cleanup, and rejection of old resource URLs.
- Type checks, lint, formatting, and production application builds checked before release.
- Independent review found an expiration-response regression in the framing function; it was
  corrected and covered by an integration assertion before release.

## Runtime artifacts

The normal Docker builds encountered package download timeouts. The release can reuse the
existing immutable API/worker runtimes and overlay the newly compiled application and workspace
packages. Both runtime lockfiles exactly match the current lockfile:

`052ee0eb56f1b3535d1b79ab504b4c7d332d94e5e9a34d2af4f39585b4999f1d`.

Keep the existing Python environments, models, OS libraries, dependencies, and runtime settings.
Verify the resulting image imports before publishing it. The additive migrations are 0048 and
0049; retain them and cleanup records during an application rollback.

## Dependency audit

The existing dependency set reports 4 critical, 33 high, 40 moderate, and 6 low findings.
This feature adds no dependencies and does not change the lockfile. The audit is **not clean**;
dependency remediation remains separate work, with a follow-up review date of 2026-10-24.

Triage context: many findings affect build tools or unused SDK capabilities. The API does not
configure trusted proxy subnets; the web deployment runs on Linux and has no `next/og` route.
Image inputs in the web app are bundled static assets, with no remote image pattern configured.
Uploads reject text fields and bound field-name length, but Multer's separate aborted-upload
descriptor advisory still warrants follow-up. These observations do not establish that every
dependency advisory is unexploitable.

## Deployment record

Staging and production deployment IDs, task revisions, and verification results are recorded
here after their respective releases. Use the previous web deployment and task revisions to
roll back application code; never reset the database, storage, queue, or secrets.
