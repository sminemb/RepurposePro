# Admin Page Specification (VS14)

## Status

Approved planning baseline. This document defines the first read-only admin area for
RepurposePro. Implementation must preserve the existing user ownership, billing, and media
retention boundaries.

## Objective and Audience

Give one designated operator a single place to understand current service activity and
investigate a user, project, processing job, payment, or credit-ledger entry without querying the
database directly.

The audience is the configured operator account. This is an internal back-office tool, not a
customer-facing dashboard or a multi-role support console.

## User Outcomes and Success Criteria

- The operator can open `/admin` and see recent business activity and current processing health.
- The operator can find a record by exact email or opaque user, project, or job ID and follow
  its related safe metadata.
- User, project, job, payment, and credit history can be reviewed with bounded pagination.
- An unauthenticated user, a signed-in non-admin, or any request made while the admin identity
  configuration is missing is denied by both the page and API.
- Admin reads cannot mutate accounts, jobs, payments, or ledger entries and cannot read media,
  transcripts, provider payloads, secrets, storage paths, or raw error text.
- Admin responses are private and not cached by browsers or shared intermediaries.

## Product Requirements

### Overview

- Provide 7-day, 30-day, and 90-day historical ranges; default to 30 days.
- Show user signups, projects created, job outcomes, and payment summaries for the selected
  range.
- Show current queued and active job counts separately from historical totals.
- Link each metric group to its relevant lookup or paginated list.
- Use the project's persisted statuses and amounts; do not infer successful work or revenue from
  queue state alone.

### Lookup and Detail

- Accept one exact email or opaque user, project, or processing-job ID per lookup.
- Match email case-insensitively after trimming surrounding whitespace. Match IDs exactly.
- A user detail view summarizes the account, related projects and jobs, payment summaries, and
  credit-ledger entries.
- Project and job details show identifiers, lifecycle status, output/job type, safe stage or
  failure code, attempt counts when available, and timestamps.
- Payment summaries show amount, currency, status, and timestamps. Credit-ledger rows show type,
  amount, and timestamp. Do not expose processor identifiers or payment instrument details.
- Empty, loading, unavailable, and invalid-query states must be explicit and recoverable.
- Lists use cursor pagination and bounded page sizes; the UI exposes next-page navigation.

### Access and Privacy

- Require a valid Better Auth session and a server-side match against one configured admin email.
- Use `ADMIN_EMAIL` as the deployment setting. Normalize it by trimming whitespace and comparing
  case-insensitively. Missing or blank configuration denies all admin access.
- Enforce the same admin check on every admin API request; hiding the page or navigation item is
  not authorization.
- Use a separate `DATABASE_ADMIN_URL` backed by a read-only database role. Grant access only to
  the approved metadata columns needed by this specification; do not reuse or broaden the normal
  runtime role.
- Mark admin responses `Cache-Control: private, no-store` and avoid serializing session or
  database-only fields to client components.
- Do not return transcripts, generated content, source or output media, provider request/response
  payloads, card data, Stripe identifiers, storage paths, raw exception text, or unfiltered
  database error details.
- Do not add write actions, exports, impersonation, role management, or audit-log management in
  this increment.

## Interface Contract

All endpoints are read-only, require the admin check, use the existing `/api/v1` error envelope,
and return `private, no-store` responses. Collection endpoints use the existing cursor convention.

| Endpoint | Purpose |
| --- | --- |
| `GET /api/v1/admin/overview?range=7d\|30d\|90d` | Historical summary and current queue counts; defaults to `30d`. |
| `GET /api/v1/admin/search?q=...` | Exact email or opaque user, project, or job ID lookup. |
| `GET /api/v1/admin/users?cursor=...` | Paginated safe user summaries. |
| `GET /api/v1/admin/users/:userId` | Safe account summary and related activity. |
| `GET /api/v1/admin/projects?cursor=...` | Paginated safe project summaries. |
| `GET /api/v1/admin/projects/:projectId` | Safe project and lifecycle metadata. |
| `GET /api/v1/admin/jobs?status=...&cursor=...` | Paginated job summaries, filterable by persisted status. |
| `GET /api/v1/admin/jobs/:jobId` | Safe job status, stage, failure code, attempts, and timestamps. |
| `GET /api/v1/admin/payments?status=...&cursor=...` | Paginated payment summaries, filterable by status. |
| `GET /api/v1/admin/ledger?userId=...&cursor=...` | Paginated immutable credit-ledger history for a user. |

The response types to document and implement are `AdminOverview`, `AdminSearchResult`,
`AdminUserSummary`, `AdminProjectSummary`, `AdminJobSummary`, `AdminPaymentSummary`, and
`AdminCreditLedgerEntry`. These are projections containing only the fields explicitly listed in
the Product Requirements; they are not aliases for database rows.

## Technical Context

- The UI belongs in the existing Next.js App Router application under the admin route and its
  feature area.
- The HTTP endpoints belong in a dedicated NestJS admin module.
- Authentication uses the existing Better Auth session integration.
- The data boundary requires a new restricted database role/connection and a forward-only
  migration for its read grants and any supporting indexes. Existing financial write protections
  and retention rules remain unchanged.
- Use the existing shared API envelope, cursor parsing, UI components, and status conventions
  where applicable.

## Testing Strategy

- Unit-test admin email normalization, missing-configuration denial, exact lookup parsing,
  date-range defaults, cursor handling, and safe projection mapping.
- Test the NestJS endpoints for unauthenticated, non-admin, authorized-admin, unavailable-data,
  and empty-result behavior.
- Run database integration scenarios proving the admin role can read only approved metadata and
  cannot write, read excluded content, or bypass existing financial constraints.
- Test search, filters, page boundaries, and each overview range against fixtures with multiple
  users and related records.
- Verify UI loading, empty, error, pagination, keyboard, and responsive states, plus end-to-end
  denial and authorized lookup flows.
- Run focused Vitest suites, `pnpm test:db-integration`, and `pnpm ci:check` during
  implementation. These commands are planned verification only; they are not run while producing
  the planning documents.

## Boundaries

- **Always:** Enforce authorization in the server and API; keep data projections explicit; keep
  reads private and no-store; return safe error codes rather than raw errors.
- **Ask before expanding:** More admin identities or roles, any write action, content previews,
  exports, processor identifiers, or access beyond the approved metadata columns.
- **Never:** Grant admin access based on client-supplied identity, reuse the database owner or
  bootstrap role at runtime, or weaken ownership, ledger, payment, queue, or retention controls.

## Risks and Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Admin checks are added only to the web route | Direct API access could expose cross-user data | Require the same session and admin-email check on every endpoint and test direct requests. |
| The admin database role receives broad table access | Sensitive content or writes could become available | Grant only approved read columns and verify privileges with database integration tests. |
| Raw exception or provider details leak through job summaries | User content or secrets could appear in the UI | Return allowlisted safe failure codes and test field projections. |
| Admin data becomes stale or shared through caches | The operator sees misleading or exposed data | Use persisted source-of-truth summaries and `private, no-store` responses. |

## Out of Scope

Multi-admin role management, customer account changes, job retries or cancellation, credit
adjustments, payment refunds, user impersonation, transcript/media preview, exports, and changes
to existing retention or financial-integrity behavior.
