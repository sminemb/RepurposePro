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

Staging verification passed twice with separate disposable accounts and projects: 23 checks per
run, including a real export, atomic conflict rejection, subset/all-five deletion, retained source
and export, project cleanup completion, inaccessible deleted resources, and repeated deletion.
An earlier export failed transiently; bounded worker failure diagnostics were added, and both
subsequent complete flows passed without render errors. A standalone Fargate render also passed.

Staging runs migrations through 0049 (50 total), API task revision 3, and worker revision 3.
The tested web deployment was `dpl_5HossDRYTaidKcw655sKrmWDLjLU`; the subsequent
documentation-only deployment `dpl_GniuhTXMT2EXUgK3N72c17NknMW5` serves
`staging.re-purpose.pro` from staging commit `0cff6a129237b96ee5dc873a95ca3b3d640d0dc9`.
The focused staging commits preserve that branch's existing authentication configuration.

Immutable images tested on staging and selected for production:

- API: `repurposepro-staging-api@sha256:3d3f6501c73a43f81984b8e025769fc9e7da46a18d0ddac50a166983b01bf4ea`.
- Worker: `repurposepro-staging-worker@sha256:e4128c1e986fc75b2c8c03592b4a9e00e43ab18f72c0bcd145806a93058130bf`.

Production verification passed all 23 checks using a disposable account and project, including
a real export, stale-batch rollback, subset and all-five deletion, retained source and export,
physical cleanup completion, deleted-resource rejection, and idempotent project deletion.
The successful fixture account was removed after verifying it had no payment or ledger records.
Public API readiness reports database and Redis up; unauthenticated deletion returns 401.

Production runs migrations through 0049 (50 total), API task revision 3 (two instances), and
worker revision 2 (one instance), with completed rollouts and unchanged capacity/configuration.
Verified application release: main commit `3274c3ca880c76f567a47041d354c2abb018f699`,
web deployment `dpl_6Vrj4TnuZ6SEnKjWw5122wPzpxuF` at `re-purpose.pro`.
The immutable API/worker image digests above are identical in staging and production.

Previous production rollback references:
API task revision 2; worker revision 1; web deployment `dpl_F95fVDULzCG8EPgw26Q2k8FEk99J`
from main commit `4bd49711b39ad820e1d69c7264225626134f7228`.
Use these application revisions to roll back; retain the additive migration and durable cleanup
records. Never reset the database, storage, queue, or secrets.
