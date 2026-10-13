# Feature Task Lists: Account Settings (VS13) and Admin Page (VS14)

Source of truth: [Implementation Plan](plan.md), [Settings PRD](../docs/settings-page-prd.md),
and [Settings Page Specification](../docs/settings-page-spec.md).

## Phase 1: Settings Foundation and Independent Account Controls

- [x] **VS13-T1 — Select transactional email provider** _(Resend selected 2026-10-08)_
  - Acceptance: Resend supports current verification, approval, and new-address verification emails.
  - Verify: Record the provider decision; VS13-T4 verifies controlled delivery after setup.
  - Dependencies: None; blocks VS13-T4 only.
  - Files: No application files for the decision; provider configuration locations follow selection.

- [x] **VS13-T2 — Add protected Settings route, navigation, and name update**
  - Acceptance: Auth redirect, desktop/mobile navigation, name validation/update, and recoverable
    feedback pass.
  - Verify: Focused route, navigation, and profile tests; manual authenticated/unauthenticated
    route checks.
  - Dependencies: VS1, VS11, and VS12 completed.
  - Files: Settings route, shared app sidebar, and focused tests under `apps/web`.

- [x] **VS13-T3 — Add password change and session revocation**
  - Acceptance: Current password required; new values match and satisfy 8–128 characters; other
    sessions revoke while current session remains active.
  - Verify: Focused validation and session-behavior tests.
  - Dependencies: VS13-T2.
  - Files: Settings password section and focused tests under `apps/web`.

## Phase 2: Verified Email Change

- [x] **VS13-T4 — Configure transactional email delivery**
  - Acceptance: The selected sender delivers all three message types and protects provider
    credentials; signup/sign-in policy is unchanged.
  - Verify: Send the messages through Resend test recipients and two controlled inboxes; check
    delivery-failure handling.
  - Dependencies: VS13-T1.
  - Files: Email-delivery integration, environment validation/reference, and focused tests.

- [x] **VS13-T5 — Implement verified email change**
  - Acceptance: Current-address approval precedes new-address verification; the current sign-in
    email remains active until verification; retry and error states are clear.
  - Verify: Test both confirmation steps, duplicate address, expired link, delivery failure, and
    retry behavior.
  - Dependencies: VS13-T2 and VS13-T4.
  - Files: Better Auth configuration, Settings email section/callback handling, and focused tests.

## Phase 3: Full Acceptance and Handoff

- [x] **VS13-T6 — Verify responsive, accessible Settings acceptance**
  - Acceptance: All PRD scenarios work independently; mobile/desktop layout, keyboard use, labels,
    focus, and live feedback pass.
  - Verify: Focused tests, manual desktop/mobile scenarios, then `pnpm ci:check`.
  - Dependencies: VS13-T2, VS13-T3, and VS13-T5.
  - Files: Focused tests and `docs/progress-tracker.md`; verification evidence as needed.

## Checkpoints

Implementation uses Better Auth 1.6.23, with current-address verification required for existing
unverified users before requesting a change. No global signup/login verification requirement,
new dependency, database migration, or parallel account API is introduced. See
[VS13 verification](../docs/verification/vs13.md) for current evidence and blockers.

`pnpm ci:check` passed on 2026-10-08: 823 unit tests, 125 database integration tests, and
6 browser scenarios. Settings screenshots and keyboard/layout checks passed. On 2026-10-13,
Resend test recipients and the complete controlled inbox flow passed. The final quality gate
passed with 828 unit tests, 125 database tests, and 6 browser scenarios after local timeout and
database test teardown fixes. All six tasks are complete; VS13 is in review.

- [x] **Profile/password checkpoint:** VS13-T2 and VS13-T3 pass focused tests, typecheck, and
      mobile/desktop layout checks.
- [x] **Email checkpoint:** VS13-T4 verifies message delivery; VS13-T5 verifies the full
      confirmation sequence.
- [x] **Completion checkpoint:** VS13-T6 passes `pnpm ci:check`; update the progress tracker and
      request human review before marking VS13 complete.

---

# Admin Page Task List (VS14)

Source of truth: [Implementation Plan](plan.md) and
[Admin Page Specification](../docs/admin-page-spec.md).

## Phase 1: Access and Data Foundation

- [ ] **VS14-T1 — Add admin identity configuration and authorization**
  - Acceptance: A valid Better Auth session and normalized configured admin email are required
    for the page and every API route; missing configuration denies access.
  - Verify: Focused signed-out, non-admin, admin, missing-config, and direct API tests.
  - Dependencies: Existing Better Auth integration.
  - Files: Environment configuration, admin page/API authorization, and focused tests.

- [ ] **VS14-T2 — Add restricted admin database read access**
  - Acceptance: Separate admin URL/role is read-only and limited to approved metadata columns;
    existing runtime and financial permissions remain unchanged.
  - Verify: `pnpm test:db-integration` scenarios for allowed reads, excluded data, and denied
    writes.
  - Dependencies: None; use the approved field allowlist in the specification.
  - Files: Forward-only migration, role/configuration, and database integration tests.

## Phase 2: Read API and Admin Screens

- [ ] **VS14-T3 — Add overview read API**
  - Acceptance: `7d`, `30d`, and `90d` ranges work, default to 30 days, separate current queue
    counts, and return safe projections with no-store headers.
  - Verify: Focused API tests for range validation/defaults, aggregation, errors, and access.
  - Dependencies: VS14-T1 and VS14-T2.
  - Files: Admin overview controller/service/contracts and focused API tests.

- [ ] **VS14-T4 — Add search, list, and detail read APIs**
  - Acceptance: Exact email/opaque-ID lookup and cursor-paginated safe user, project, job,
    payment, and ledger data are available with approved status filters.
  - Verify: Focused API tests for matching, no match, pagination, filters, safe fields, and
    authorization.
  - Dependencies: VS14-T1 and VS14-T2.
  - Files: Admin API contracts/services/repositories and focused API tests.

- [ ] **VS14-T5 — Build admin overview UI**
  - Acceptance: Overview defaults to 30 days, supports each range, separates current queue state,
    and provides loading/error/empty states with responsive accessible layout.
  - Verify: Focused web tests and manual keyboard, mobile, and desktop checks.
  - Dependencies: VS14-T1 and VS14-T3.
  - Files: Admin route, overview components/data access, navigation visibility, and web tests.

- [ ] **VS14-T6 — Build lookup, lists, and safe detail views**
  - Acceptance: Exact lookup connects records to related details; lists paginate/filter; prohibited
    content and state-changing controls are absent.
  - Verify: Focused UI tests for search, no results, pagination, filters, details, and field
    visibility; manual responsive/keyboard checks.
  - Dependencies: VS14-T1 and VS14-T4.
  - Files: Admin search/list/detail components and focused web tests.

## Phase 3: Acceptance and Handoff

- [ ] **VS14-T7 — Verify admin end-to-end and record evidence**
  - Acceptance: All spec scenarios pass; admin data is private/no-store and read-only; evidence is
    recorded before the slice is marked complete.
  - Verify: Focused Vitest suites, `pnpm test:db-integration`, and `pnpm ci:check`; manually
    check signed-out, non-admin, and authorized-admin flows.
  - Dependencies: VS14-T3, VS14-T4, VS14-T5, and VS14-T6.
  - Files: Focused tests, progress tracker, and verification evidence if needed.

## Checkpoints

- [ ] **Security/data checkpoint:** VS14-T1/T2 verify fail-closed authorization, least privilege,
  excluded fields, and denied writes.
- [ ] **Read workflow checkpoint:** VS14-T3–T6 verify overview, lookup, pagination, filters, and
  detail flows end to end.
- [ ] **Completion checkpoint:** VS14-T7 passes focused tests, database checks, quality gates,
  and human review.
