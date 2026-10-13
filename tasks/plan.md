# Implementation Plans: Account Settings (VS13) and Admin Page (VS14)

## Overview

VS13 is a planned post-MVP increment based on the [Settings PRD](../docs/settings-page-prd.md)
and [Settings Page Specification](../docs/settings-page-spec.md). A signed-in creator will be
able to update their name, securely change their sign-in email, and change their password from
`/dashboard/settings`.

This feature reuses the existing Next.js app shell and Better Auth integration. It does not add
a separate account API, new user fields, account deletion, or a database migration unless
implementation uncovers a concrete requirement. Current-address approval and new-address
verification use Resend's HTTP API, selected by the product owner on 2026-10-08. Existing
unverified accounts first verify their current address, then complete both email-change steps.

## Architecture Decisions

- Keep account management in the Next.js web app and use Better Auth's authenticated user,
  email-change, password-change, and session flows.
- Reuse the existing `users`, `accounts`, `sessions`, and `verifications` tables. Confirm schema
  compatibility against the installed Better Auth version before considering a migration.
- Preserve current signup and sign-in verification behavior. Keep the current email active until
  the proposed address is verified.
- Keep the email provider vendor-neutral in product behavior. Use server-side fetch against
  Resend without a new dependency. Validate `RESEND_API_KEY` and `RESEND_FROM` at startup;
  require both for staging/production. Local environments without either disable email actions.
- Keep Settings focused on individual account identity and credentials. Leave deletion, billing,
  workspace controls, and video-processing preferences outside VS13.

## Dependency Graph

```text
Completed VS1 + VS11 + VS12
             |
             +--> VS13-T2: protected route, navigation, name update
             |          |
             |          +--> VS13-T3: password change
             |          |
             |          +--> VS13-T5: verified email change
             |          |
             |          +--> VS13-T6: final acceptance and responsive review
             |
VS13-T1: select email provider
             |
             +--> VS13-T4: configure mail delivery
                              |
                              +--> VS13-T5
                                           |
                                           +--> VS13-T6

VS13-T3 -------------------------------------> VS13-T6
```

## Tasks

### Phase 1: Settings Foundation and Independent Account Controls

#### VS13-T1 — Select Transactional Email Provider

**Description:** Resend was selected by the product owner on 2026-10-08. Configure a verified
sender and API key locally, then verify delivery in VS13-T4.

**Acceptance criteria:**

- [x] Provider selection is recorded before provider-specific implementation begins: Resend.
- [x] The provider supports current verification, approval, and new-address verification emails.

**Verification:** Confirm and record the provider decision. VS13-T4 verifies development or
sandbox delivery after configuration.

**Dependencies:** None. This decision blocks VS13-T4 but not VS13-T2 or VS13-T3.

**Files likely touched:** No application files for the decision. Provider configuration files
will be identified after selection.

**Estimated scope:** Small decision task.

#### VS13-T2 — Add Protected Settings Route, Navigation, and Name Update

**Description:** Add the authenticated Settings route, activate the shared desktop/mobile
navigation item, and let a user update their account name with independent loading and feedback
states.

**Acceptance criteria:**

- [x] Unauthenticated visitors are redirected to `/login`; authenticated users see their own
      account name.
- [x] Settings is a usable, active navigation link on desktop and mobile; existing sign-out
      behavior remains available.
- [x] Name updates trim whitespace, reject empty values, persist through Better Auth, refresh the
      app-shell name, and preserve input after recoverable failures.

**Verification:** Add focused route, profile-update, and navigation tests; manually verify an
authenticated and unauthenticated visit.

**Dependencies:** VS1, VS11, and VS12 are completed.

**Files likely touched:** `apps/web/app/dashboard/settings/page.tsx`,
`apps/web/components/app/app-sidebar.tsx`, and focused colocated tests.

**Estimated scope:** Medium.

#### VS13-T3 — Add Password Change and Session Revocation

**Description:** Add current password, new password, and confirmation fields. On successful
change, revoke other sessions while keeping the current session active.

**Acceptance criteria:**

- [x] All fields are required, the new values must match, and length must be 8–128 characters.
- [x] The current password is verified by Better Auth; passwords are never exposed in messages
      or logs.
- [x] Success clears password fields and leaves the current session usable while other sessions
      are revoked.

**Verification:** Add focused tests for missing fields, mismatch, length boundaries, invalid
current password, successful session revocation, and current-session continuity.

**Dependencies:** VS13-T2.

**Files likely touched:** Settings password section and its focused tests under `apps/web`.

**Estimated scope:** Medium.

### Checkpoint: Profile and Password

- [x] VS13-T2 and VS13-T3 acceptance criteria pass.
- [x] `pnpm test` and `pnpm typecheck` pass.
- [x] Settings shell remains usable at mobile and desktop widths.

### Phase 2: Verified Email Change

#### VS13-T4 — Configure Transactional Email Delivery

**Description:** Add the selected transactional sender and message delivery configuration used
by the later Better Auth email-change flow.

**Acceptance criteria:**

- [x] The sender can deliver current verification, current-address approval, and new-address verification.
- [x] Provider credentials are validated at startup and never exposed in logs or client errors.
- [x] Delivery behavior is tested in a controlled environment without changing signup or sign-in
      verification policy.

**Verification:** Send both message types through the provider's development or sandbox mode and
verify delivery-failure handling.

**Dependencies:** VS13-T1.

**Files likely touched:** Email-delivery integration under `apps/web`, environment validation
and reference, and focused tests.

**Estimated scope:** Medium.

#### VS13-T5 — Implement Verified Email Change

**Description:** Configure Better Auth's current-address approval and new-address verification
flow and expose its request, pending, confirmation, and retry states in Settings.

**Acceptance criteria:**

- [x] Current-address approval precedes new-address verification; the current email stays active
      until verification completes.
- [x] Invalid, duplicate, expired, delivery-failure, and retry states are clear.
- [x] Signup and sign-in verification policy remains unchanged.

**Verification:** Cover request, both confirmation steps, duplicate address, expired link,
delivery failure, and retry behavior with focused tests and controlled email delivery.

**Dependencies:** VS13-T2 and VS13-T4.

**Files likely touched:** Better Auth configuration, Settings email section, callback handling,
and focused tests under `apps/web`.

**Estimated scope:** Medium.

### Phase 3: Full Acceptance and Handoff

#### VS13-T6 — Verify Responsive, Accessible Settings Acceptance

**Description:** Verify all account sections together, confirm accessibility and responsive
behavior, and record implementation evidence in the progress tracker.

**Acceptance criteria:**

- [x] Profile, email, and password actions work independently and satisfy the PRD acceptance
      criteria.
- [x] Keyboard operation, visible focus, labels, and accessible status/error announcements work.
- [x] Desktop and mobile layouts have no horizontal overflow; sign-out and other navigation
      behavior remain correct.

**Verification:** Run focused tests and `pnpm ci:check`; manually verify desktop and mobile
flows, both email confirmation steps, and session behavior.

**Dependencies:** VS13-T2, VS13-T3, and VS13-T5.

**Files likely touched:** Focused web tests and `docs/progress-tracker.md`; add a verification
record under `docs/verification/` if the implementation produces durable evidence.

**Estimated scope:** Medium.

### Checkpoint: Complete

- [x] All VS13 acceptance criteria are met.
- [x] Formatting, lint, typecheck, tests, and build checks pass through `pnpm ci:check`.
- [x] Email delivery and verification behavior are tested in the selected provider's controlled
      environment.
- [x] Start/end times, blockers, verification, and handoff state are recorded in
      `docs/progress-tracker.md`.
- [ ] A human reviews and approves the completed slice.

## Risks and Mitigations

| Risk                                                            | Impact                                       | Mitigation                                                                                            |
| --------------------------------------------------------------- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Real Resend delivery is not verified                            | Blocks email-delivery acceptance and release | Configure the key and verified sender; test controlled inboxes in VS13-T4.                            |
| User cannot access the current email address                    | User cannot self-serve an email change       | Explain the requirement; keep recovery out of scope and use the existing out-of-band support process. |
| Auth behavior or schema differs from the documented expectation | Could require extra work or migration        | Confirm installed Better Auth behavior and existing schema before changing database structure.        |
| Pending email is mistaken for active sign-in email              | User confusion or account access problems    | Keep the current email active until new-address verification and clearly label each step.             |

## Confirmed Decisions and Delivery Prerequisites

- Provider: Resend HTTP API, without an SDK dependency.
- Unverified users verify the current address before requesting a change. Signup/login remain unchanged.
- Configure credentials in ignored `.env`; real delivery requires a verified sender and two controlled inboxes.
- Better Auth 1.6.23 catches mail errors by default. Its account-email context extension awaits
  delivery and propagates safe failure responses, with no custom account API or token store.

## Implementation Evidence — 2026-10-08 and 2026-10-13

T1, T2, T3, and T5 acceptance checks passed. `pnpm ci:check` passed with 823 unit tests,
125 PostgreSQL/Redis integration tests, and 6 production browser scenarios. Keyboard and
320–1440px layout checks passed; screenshots were reviewed. T4 passed on 2026-10-13: all three
templates were accepted by Resend test recipients and received/opened through two controlled
inboxes. The new address is verified, fresh login works, and the original address is rejected.
T6 passed the final quality gate at 09:44 Asia/Manila: 828 unit tests, 125 database tests, and
6 browser scenarios. All six tasks are complete; the slice awaits human review. See
[VS13 verification](../docs/verification/vs13.md) for evidence and the delivery procedure.

## References

- [Settings PRD](../docs/settings-page-prd.md)
- [Settings Page Specification](../docs/settings-page-spec.md)
- [Build Plan](../docs/build-plan.md)
- [Progress Tracker](../docs/progress-tracker.md)

---

# Implementation Plan: Admin Page (VS14)

## Overview

VS14 adds a read-only, overview-first admin area for one designated operator. It supports
service operations, customer support, and billing investigation using safe metadata. The
approved requirements and API contract are in the [Admin Page Specification](../docs/admin-page-spec.md).

## Architecture Decisions

- Keep the admin UI in the existing Next.js app and add admin read endpoints in a dedicated
  NestJS module.
- Require a valid Better Auth session and a configured `ADMIN_EMAIL` match in both the page and
  every admin API request. Missing configuration fails closed.
- Add a separate `DATABASE_ADMIN_URL` and read-only database role with access limited to the
  approved metadata columns. Do not broaden the normal runtime role.
- Use explicit safe response projections, the existing API envelope and cursor convention, and
  `private, no-store` response headers.
- Preserve current account ownership, payment/ledger protections, queue behavior, and media
  retention. Add no admin mutation, content preview, impersonation, or export.

## Dependency Graph

```text
VS14-T1: admin identity configuration and authorization
VS14-T2: restricted metadata database role and migration
       |                         |
       +-----------+-------------+
                   |
                   +--> VS14-T3: overview API
                   +--> VS14-T4: search and detail APIs
                                |                    |
                                +--> VS14-T5: overview UI
                                +--> VS14-T6: lookup and detail UI
                                                     |
VS14-T5 + VS14-T6 -------------------------------> VS14-T7: acceptance
```

## Tasks

### Phase 1: Access and Data Foundation

#### VS14-T1 — Add Admin Identity Configuration and Authorization

**Description:** Add `ADMIN_EMAIL` configuration and server-side checks for the admin page and
all admin API requests using the existing Better Auth session.

**Acceptance criteria:**

- [ ] A valid session with a normalized email matching configured `ADMIN_EMAIL` is required.
- [ ] Missing or blank configuration and non-matching users are denied on both page and API.
- [ ] Client-supplied identity never affects authorization; existing auth behavior is unchanged.

**Verification:** Focused tests cover signed-out, non-admin, admin, and missing-config cases,
including direct API requests.

**Dependencies:** Existing Better Auth integration.

**Files likely touched:** Shared environment configuration, NestJS admin authorization, Next.js
admin route protection, and focused tests.

**Estimated scope:** Medium.

#### VS14-T2 — Add Restricted Admin Database Read Access

**Description:** Add a separate admin database role and connection with read-only grants limited
to the safe metadata columns required by the spec. Add only indexes needed for exact lookup,
filters, and cursor pagination.

**Acceptance criteria:**

- [ ] The role cannot insert, update, delete, or access excluded transcript, media, provider,
  credential, raw-error, or storage-path data.
- [ ] The normal runtime, checkout, webhook, processing, and owner roles retain their current
  permissions.
- [ ] The migration is forward-only and can be applied without changing financial or retention
  invariants.

**Verification:** Database integration tests assert both allowed reads and denied access/writes;
run the repository database integration command.

**Dependencies:** None; coordinate the approved field list with VS14-T3 and VS14-T4.

**Files likely touched:** New Drizzle migration, database role provisioning/grant configuration,
admin database connection configuration, and integration tests.

**Estimated scope:** Medium.

### Phase 2: Read API and Admin Screens

#### VS14-T3 — Add Overview Read API

**Description:** Add the date-range overview endpoint and safe aggregation service for historical
users, projects, jobs, payment summaries, and current queued/active jobs.

**Acceptance criteria:**

- [ ] `7d`, `30d`, and `90d` are accepted; missing range defaults to `30d`; invalid ranges return
  the existing validation error envelope.
- [ ] Historical and current queue metrics are clearly separated and derived from persisted
  records.
- [ ] Output contains only fields defined by `AdminOverview` and is not cached.

**Verification:** Focused API tests cover ranges, defaulting, invalid input, fixture aggregation,
admin denial, and unavailable database responses.

**Dependencies:** VS14-T1 and VS14-T2.

**Files likely touched:** Admin controller/service/contracts, module registration, and focused
API tests.

**Estimated scope:** Medium.

#### VS14-T4 — Add Search, List, and Detail Read APIs

**Description:** Add exact email/ID lookup and paginated safe summaries for users, projects, jobs,
payments, and ledger entries, including related user detail data.

**Acceptance criteria:**

- [ ] Search accepts exact email or opaque user/project/job ID only; partial names and content
  search are unsupported.
- [ ] Collections use bounded cursor pagination and documented status filters.
- [ ] Projections follow the spec field allowlists and never return raw error or processor data.

**Verification:** API tests cover exact match/no match, email normalization, related records,
status filters, cursor boundaries, excluded fields, and authorization failures.

**Dependencies:** VS14-T1 and VS14-T2.

**Files likely touched:** Admin contracts/services/repositories, shared API types if required, and
focused API tests.

**Estimated scope:** Medium.

#### VS14-T5 — Build Admin Overview UI

**Description:** Add the protected `/admin` overview with date range control, historical summary,
current queue counts, navigation to lookup/list views, and explicit loading/error/empty states.

**Acceptance criteria:**

- [ ] The overview defaults to 30 days and updates metrics for each supported range.
- [ ] Current queue counts remain separate from historical metrics.
- [ ] Layout follows existing UI conventions and works by keyboard and on mobile/desktop.

**Verification:** Focused component/page tests and manual responsive, keyboard, loading, empty,
and error-state checks.

**Dependencies:** VS14-T1 and VS14-T3.

**Files likely touched:** Admin route, admin feature components/data access, navigation visibility,
and focused web tests.

**Estimated scope:** Medium.

#### VS14-T6 — Build Lookup, Lists, and Safe Detail Views

**Description:** Add exact lookup and paginated user, project, job, payment, and ledger views with
linked support details.

**Acceptance criteria:**

- [ ] The operator can find a record by exact email or opaque ID and navigate to its related
  safe detail view.
- [ ] Pagination and job/payment status filters work without losing query context.
- [ ] No content previews, write actions, exports, raw exceptions, or hidden sensitive fields are
  rendered.

**Verification:** Focused UI tests cover search, no results, pagination, filters, related detail,
and field visibility; manually verify keyboard and responsive behavior.

**Dependencies:** VS14-T1 and VS14-T4.

**Files likely touched:** Admin list/detail components, server data access, and focused web tests.

**Estimated scope:** Medium.

### Phase 3: Acceptance and Handoff

#### VS14-T7 — Verify Admin End-to-End and Record Evidence

**Description:** Verify authorization, database restrictions, API/UI behavior, and project quality
gates; record evidence in the progress tracker when implementation begins.

**Acceptance criteria:**

- [ ] All spec scenarios pass, including direct API denial and read-only database enforcement.
- [ ] The interface exposes no disallowed content and all responses are private/no-store.
- [ ] Focused tests, database integration checks, and the repository quality gate pass.

**Verification:** Run focused Vitest suites, `pnpm test:db-integration`, and `pnpm ci:check`;
manually verify signed-out, non-admin, and authorized-admin flows across desktop and mobile.

**Dependencies:** VS14-T3, VS14-T4, VS14-T5, and VS14-T6.

**Files likely touched:** Focused tests and `docs/progress-tracker.md`; add durable verification
evidence if needed.

**Estimated scope:** Medium.

## Checkpoints

- [ ] **Security/data checkpoint:** VS14-T1 and VS14-T2 prove fail-closed authorization and
  least-privilege database access.
- [ ] **Read workflow checkpoint:** VS14-T3 through VS14-T6 provide end-to-end overview, lookup,
  pagination, and safe detail workflows.
- [ ] **Completion checkpoint:** VS14-T7 passes focused, database, and full quality checks; a
  human reviews the result before marking VS14 complete.

## Risks and Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Admin authorization is enforced only in the UI | Direct API calls could expose cross-user data | Apply and test the admin check at every API boundary. |
| Admin database permissions are too broad | Sensitive data or writes could be exposed | Use a separate role and test column/table permissions and denied writes. |
| Status/error fields contain unsafe details | User content or secrets could leak | Project allowlisted status and failure codes; omit raw exception text. |
| Aggregates disagree with durable state | Support decisions may be misleading | Use persisted database records as the source of truth and distinguish live queue counts. |

## Open Questions

- None for the approved first version. The operator's actual login email is deployment
  configuration and is not recorded in source control.

## References

- [Admin Page Specification](../docs/admin-page-spec.md)
- [Database Schema](../docs/database-schema.md)
- [Security Boundaries ADR](../docs/adr/0009-security-boundaries.md)
- [API Contracts](../docs/api-contracts.md)
- [Progress Tracker](../docs/progress-tracker.md)
