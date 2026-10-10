# VS14 admin verification

Implementation started on 2026-10-10 at 21:26 Asia/Manila on `codex/vs14-admin`.
The implementation delivers VS14-T1 through T7 from the approved admin specification.
All seven implementation tasks are complete. The slice is IN_REVIEW pending human review.

## Delivered behavior

- Every admin endpoint and server data loader validates the Better Auth session and the
  normalized deployment-configured operator email. Missing identity configuration denies access.
- Ten read endpoints use seven explicit shared metadata projections. Responses, including
  denials and dependency errors, are private and no-store; web reads disable fetch caching.
- A separately managed `repurposepro_admin` connection reads approved columns and a safe job
  metadata view. It cannot read content, credentials, provider identifiers, descriptions,
  storage paths, or raw errors; it cannot write or execute application functions.
- Overview cohorts use creation timestamps in rolling UTC windows, grouped by current saved
  statuses. Payments remain separate by currency/status; current queued/active counts span all dates.
- Exact lookup checks all matching categories. Lists use timestamp/ID cursors, preserve
  PostgreSQL microseconds, and support independently pageable owner/project histories.
- Operator-only navigation, overview, lookup, lists, details, and user ledger history use the
  existing application shell. Return links preserve list filters/cursors and search queries.

## Verification coverage

| Boundary | Evidence |
| --- | --- |
| Identity | Config and guard tests cover normalized email, missing/blank configuration, signed-out sessions, non-admins, and forged request identity. Browser scenarios call all ten endpoints directly as a non-admin. |
| Least privilege | PostgreSQL tests exercise safe column reads and reject excluded tables/columns, writes on all domains, schema creation, role escalation, and application-function execution. The complete existing financial/retention suite runs alongside them. |
| Queries | Contract and PostgreSQL tests cover all ranges/defaults, inclusive lower/exclusive upper time boundaries, current status grouping, mixed currencies, exact/no-match lookup, overlapping IDs, owner/project/status filters, malformed cursors, and tied microsecond timestamps. |
| Privacy and availability | API, loader, rendering, and browser tests assert safe projections, generic unknown failure codes, sanitized 503 errors, private/no-store headers, and recovery after temporarily revoking a safe read grant in the disposable browser database. |
| Interface | Chromium scenarios cover all ranges, search, details, ledger pagination, filtered list return navigation, empty/invalid states, retry, mobile menu keyboard focus/Escape, horizontal table scrolling by keyboard, and layouts at 320, 768, 1024, and 1440 pixels. Screenshots are inspected visually. |

The browser runner retains real session validation, admin guards, database roles, API queries,
and page loaders. Remote billing/AI/protection services use the existing test fixtures. No
production deployment or real payment was performed.

Admin accounts are seeded only in the disposable test database using Better Auth's password
hasher, then authenticated through normal sign-in. This avoids consuming the signup quota
needed by the existing MVP scenarios; application rate limits remain enabled.

## Independent review

A fresh-context reviewer examined the authorization/database boundary and then the final
API/UI implementation. Three concrete findings were repaired:

1. PostgreSQL URL query parameters could override the configured role. Admin URLs now reject
   all query parameters; regression coverage proves fail-closed behavior.
2. A users cursor copied into a UUID collection produced a database error. Collection-specific
   cursor validation now rejects it before querying.
3. Casting UUID IDs to text prevented primary-key lookup indexes. Project/job lookups now
   validate UUID shape and compare the UUID column directly.

The final bounded review confirmed all three fixes and found no remaining blockers. It also
checked that return navigation accepts only local admin paths.

Gemini CLI was unavailable. The user explicitly chose to continue with the completed independent
review. Human review remains pending; the slice must remain `IN_REVIEW` until that review occurs.

## Results and handoff

- Focused admin Vitest suites: 18 passed; PostgreSQL scenarios run through the integration runner.
- Full Vitest suite: 134 files / 799 tests passed; 132 database scenarios are run separately.
- Separate `pnpm test:db-integration`: 13 files / 131 tests passed at 21:58 Asia/Manila.
  The final gate also includes the subsequent overlapping-ID regression.
- Final gate database suite: 13 files / 132 tests passed at 22:21 Asia/Manila.
- Full `pnpm ci:check`: passed at 22:25 Asia/Manila, including formatting, lint, typecheck,
  799 unit tests, 132 database integration tests, the production build, and all six Chromium
  browser scenarios (two admin and four existing MVP workflows).
- Final browser evidence: `storage/vs12-e2e/36c22dffa9ac47fc9a89f2f18eea52f4`;
  full gate log: `storage/vs14-ci-check.log` (generated artifacts are ignored).
- Separate Chrome DevTools observation confirmed signed-out `/admin` redirects to `/login`,
  with no admin links or admin activity rendered.
- Implementation commits: `c1ca7d1` (metadata foundation), `1e3f502` (protected read API),
  `512346e` (interface and browser scenarios).

Screenshots inspected: [desktop overview](vs14/admin-overview-desktop.png),
[320px overview](vs14/admin-overview-mobile.png), and [390px user history](vs14/admin-user-mobile.png).

Before enabling the feature, configure private `ADMIN_EMAIL` and `DATABASE_ADMIN_URL` settings,
provision the dedicated role, and apply migration `0047_vs14_admin_metadata.sql` with the normal
owner migration process. Configure the admin URL in `.env.database` for provisioning/restoration
and in the API environment for runtime reads. Missing runtime database configuration produces
a sanitized unavailable state and never falls back to a more privileged connection.

API/environment details: [API contracts](../api-contracts.md), [environment reference](../env-reference.md),
and [admin metadata ADR](../adr/0010-read-only-admin-metadata.md).
