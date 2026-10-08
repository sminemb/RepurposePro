# PRD: RepurposePro Settings Page

**Status:** Draft  
**Source:** [Settings Page Specification](settings-page-spec.md)

## Executive Summary

RepurposePro creators need a clear, secure place to manage the identity and credentials they use
to access their account. The Settings page will let a signed-in user update their name, change
their sign-in email through a two-step verification flow, and change their password while
revoking other active sessions.

The page will live at `/dashboard/settings` and become available through the shared application
navigation. Account deletion, billing, workspace management, and video-processing preferences are
outside this release.

## Problem

Settings is currently a locked navigation item with no page behind it. Users cannot manage their
account identity or credentials in the product. Email changes need extra care because the email
address is also the user's sign-in identifier, and the application does not currently have
transactional email delivery configured.

## Users

**Primary user:** A signed-in individual creator who wants to keep their account name and
sign-in credentials current.

The page does not serve team administrators or shared workspaces; team accounts are outside the
current product scope.

## Goals and Success Criteria

- Users can find Settings from the desktop sidebar and mobile navigation.
- An authenticated user can update their name and see the updated name reflected across the app.
- Users can change their sign-in email only after approving the change from the current address
  and verifying the new address.
- Users can change their password after entering the current password; other active sessions are
  revoked while the current session remains usable.
- Each operation provides clear progress, success, validation, and failure feedback.
- The page works at mobile and desktop widths and is usable with a keyboard and assistive
  technology.

## Scope

### Included

- Authenticated Settings page at `/dashboard/settings`.
- Editable account name.
- Sign-in email change with current-address approval followed by new-address verification.
- Password change with current password, new password, and confirmation fields.
- Shared navigation activation for Settings, with an active state on the Settings route.
- Responsive layout, accessible form controls, and operation-specific feedback.
- Vendor-neutral transactional email requirements for the two email-change messages.

### Excluded

- Account deletion or other destructive account actions.
- Billing and payment management.
- Workspace, team, or member management.
- Video-processing or editing preferences.
- Avatar editing or additional profile fields.
- In-app recovery for users who cannot access their current email address.
- A product-wide email-verification requirement for signup or sign-in.

## User Journeys

### Update Name

1. The user opens Settings from the shared navigation.
2. The page loads the signed-in user's current account name.
3. The user edits the name and saves it.
4. The page reports success and reflects the updated name in the app shell.

An empty name is rejected. If saving fails, keep the user's entered value available for retry.

### Change Sign-In Email

1. The user enters a valid email address different from the active sign-in address.
2. The app sends an approval link to the current address.
3. After approval, the app sends a verification link to the proposed address.
4. The proposed address becomes the sign-in email only after it is verified.

Until the final verification succeeds, the current email remains active. The page explains each
step and provides clear recovery guidance for invalid or expired links, an address already in use,
delivery failure, or a request that needs to be retried. A user who cannot access the current
address must use an out-of-band support process.

### Change Password

1. The user enters their current password, a new password, and the new password confirmation.
2. The app validates required fields, matching new values, and the password length.
3. After successful verification, the new password is saved and other active sessions are
   revoked.
4. The current session remains usable. The page reports success and clears password fields.

## Functional Requirements

### Access and Navigation

- **PR-001:** `/dashboard/settings` requires an authenticated session. Unauthenticated visitors
  are redirected to `/login`.
- **PR-002:** Settings is a usable link in the shared desktop and mobile navigation and has an
  active state on the Settings route.
- **PR-003:** The existing sign-out controls remain in the app shell.
- **PR-004:** Settings data is private to the signed-in user and must not be shared through a
  public or cross-user cache.

### Profile Name

- **PR-005:** Display the signed-in user's current name in an editable field.
- **PR-006:** Trim surrounding whitespace and reject an empty name.
- **PR-007:** Save through the existing Better Auth user-update flow. Show pending, success, and
  failure states. Preserve the entered value after recoverable errors.
- **PR-008:** Reflect a successful name update in the app shell without requiring the user to
  sign out and back in.

### Sign-In Email

- **PR-009:** Display the currently active sign-in email and accept a syntactically valid,
  different proposed email.
- **PR-010:** Require approval from the current address before sending verification to the new
  address.
- **PR-011:** Keep the current address active until verification of the new address succeeds.
- **PR-012:** Do not permit immediate changes for unverified current addresses. Do not change
  signup or sign-in verification policy as part of this feature.
- **PR-013:** Explain the current-address approval and new-address verification steps. Handle
  duplicate addresses, delivery errors, invalid or expired links, and retry outcomes without
  reporting a change prematurely.
- **PR-014:** Keep delivery vendor-neutral in product behavior. A transactional email sender
  must be configured before this feature can ship.

### Password

- **PR-015:** Provide current password, new password, and confirmation fields.
- **PR-016:** Require all values, require matching new password values, and enforce the existing
  8-to-128-character password policy. Server-side validation remains authoritative.
- **PR-017:** Require the current password and request revocation of other active sessions after
  a successful password change.
- **PR-018:** Keep the current session usable. Clear password inputs after success; never echo or
  log password values.

### Experience and Accessibility

- **PR-019:** Keep profile, email, and password operations independent so a failure in one
  section does not block the others.
- **PR-020:** Provide visible labels, keyboard access, visible focus, appropriate autocomplete
  hints, and accessible announcements for progress, success, and errors.
- **PR-021:** Follow RepurposePro's existing UI rules and design tokens. Support narrow and wide
  screens without horizontal scrolling.

## Product and Engineering Constraints

- Use the existing Better Auth integration for user updates, email changes, password changes,
  and session handling. Do not duplicate auth-owned user fields or add a parallel account API.
- Existing `users`, `accounts`, `sessions`, and `verifications` tables are expected to support
  these flows. No database migration is anticipated; confirm against the installed Better Auth
  version during implementation.
- Preserve existing signup and sign-in behavior. Pending email changes must not lock a user out
  of their current account.
- The project has no configured transactional email provider. Provider selection and setup are
  implementation prerequisites and require a separate decision.
- Follow [ADR 0009](adr/0009-security-boundaries.md) for security boundaries and
  [ADR 0008](adr/0008-file-retention.md) for account-retention policy.

## Acceptance Criteria

1. An unauthenticated visitor is redirected to `/login`; an authenticated user sees their own
   account data.
2. Settings is reachable and correctly marked active in desktop and mobile navigation. Existing
   sign-out behavior remains available.
3. A valid name change succeeds and is reflected in the app shell. Empty input is rejected, and
   recoverable failures preserve the entered value.
4. Email changes require current-address approval and new-address verification. The current
   email remains active until verification completes.
5. Invalid, unchanged, duplicate, expired, and failed-delivery email changes show clear feedback
   and allow a safe retry.
6. Password changes reject missing inputs, mismatched values, invalid lengths, and an incorrect
   current password. Success revokes other sessions while preserving the current one.
7. All three sections work independently across mobile and desktop layouts and meet the specified
   keyboard and assistive-technology requirements.

## Dependencies and Risks

- Transactional email delivery must be selected, configured, and tested before email changes can
  ship. Both the current-address approval and new-address verification messages depend on it.
- A user without access to the current mailbox cannot complete the self-service email-change
  flow. Recovery remains outside this release and requires an out-of-band support process.
- Better Auth behavior and current schema compatibility must be checked against the installed
  version before implementation; avoid introducing a migration unless that check identifies a
  concrete need.

## Validation Plan

The implementation should add focused tests for the acceptance criteria, including auth
redirects, name validation and update, both email-confirmation steps, pending-email behavior,
retry/error paths, password validation, session revocation, navigation state, responsive
behavior, and accessible feedback.

Run the repository quality checks before review:

- `pnpm format:check`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm ci:check`

## Boundaries

- **Always:** Validate inputs on the server, preserve current-email access until the new address
  is verified, and keep secrets and verification tokens out of logs and user-visible errors.
- **Ask first:** Select or add an email-delivery provider, change signup/sign-in verification
  policy, add dependencies, change CI configuration, or introduce a database migration.
- **Never:** Add account deletion to this release, expose passwords or tokens, or allow an
  unverified email address to replace the active sign-in address.

## References

- [Settings Page Specification](settings-page-spec.md)
- [RepurposePro UI Rules](ui-rules.md)
- [ADR 0008 — File retention with fenced cleanup](adr/0008-file-retention.md)
- [ADR 0009 — Security boundaries and fail-closed mutations](adr/0009-security-boundaries.md)
- [Better Auth: User and Account Management](https://www.better-auth.com/docs/concepts/users-accounts)
- [Better Auth: Email and Password Authentication](https://www.better-auth.com/docs/authentication/email-password)
- [Better Auth: Session Management](https://www.better-auth.com/docs/concepts/session-management)
