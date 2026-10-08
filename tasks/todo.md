# Account Settings Task List (VS13)

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

- [ ] **VS13-T4 — Configure transactional email delivery**
  - Acceptance: The selected sender can deliver both message types and protects provider
    credentials; signup/sign-in policy is unchanged.
  - Verify: Send both messages through the provider's development or sandbox mode and check
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

- [ ] **VS13-T6 — Verify responsive, accessible Settings acceptance**
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
6 browser scenarios. Settings screenshots and keyboard/layout checks passed. T4 and final T6
acceptance remain open until Resend is configured and the controlled inbox procedure passes.

- [x] **Profile/password checkpoint:** VS13-T2 and VS13-T3 pass focused tests, typecheck, and
      mobile/desktop layout checks.
- [ ] **Email checkpoint:** VS13-T4 verifies message delivery; VS13-T5 verifies the full
      confirmation sequence.
- [ ] **Completion checkpoint:** VS13-T6 passes `pnpm ci:check`; update the progress tracker and
      request human review before marking VS13 complete.
