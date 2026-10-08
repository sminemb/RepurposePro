# Implementation Plan: Account Settings (VS13)

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

- [ ] The sender can deliver both current-address approval and new-address verification messages.
- [x] Provider credentials are validated at startup and never exposed in logs or client errors.
- [ ] Delivery behavior is tested in a controlled environment without changing signup or sign-in
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

- [ ] Profile, email, and password actions work independently and satisfy the PRD acceptance
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

- [ ] All VS13 acceptance criteria are met.
- [x] Formatting, lint, typecheck, tests, and build checks pass through `pnpm ci:check`.
- [ ] Email delivery and verification behavior are tested in the selected provider's controlled
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

## Implementation Evidence — 2026-10-08

T1, T2, T3, and T5 acceptance checks passed. `pnpm ci:check` passed with 823 unit tests,
125 PostgreSQL/Redis integration tests, and 6 production browser scenarios. Keyboard and
320–1440px layout checks passed; screenshots were reviewed. T4 and final T6 acceptance remain
open for real Resend delivery through two controlled inboxes. See
[VS13 verification](../docs/verification/vs13.md) for evidence and the delivery procedure.

## References

- [Settings PRD](../docs/settings-page-prd.md)
- [Settings Page Specification](../docs/settings-page-spec.md)
- [Build Plan](../docs/build-plan.md)
- [Progress Tracker](../docs/progress-tracker.md)
