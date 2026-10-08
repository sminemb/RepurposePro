# Settings Page Specification

## Purpose

Provide signed-in RepurposePro creators with a clear place to manage their account identity and
sign-in credentials. This specification describes the future page and its acceptance criteria; it
does not change application code.

## Current State

- The desktop sidebar contains a locked Settings item and there is no Settings page at
  `/dashboard/settings`.
- The mobile navigation reuses the sidebar, so one navigation change will expose Settings on both
  screen sizes.
- The app already has authenticated page patterns, Better Auth email/password authentication, and
  sign-out controls in the app shell.
- Better Auth's `users` and `verifications` tables already exist. The user record contains name,
  email, and email-verification state; verification tokens use the existing verification table.
- No transactional email provider is configured in the repository.

## Scope and Route

Implement the future page at `/dashboard/settings`. Require an authenticated session and redirect
unauthenticated visitors to `/login`, following the dashboard's existing session handling. Treat
the page as user-specific data and do not allow it to be shared through a public or cross-user
cache.

Activate the Settings item in the shared sidebar and link it to `/dashboard/settings`. Mark it
active on the Settings route. Preserve the existing sign-out controls in the desktop topbar and
mobile navigation.

The page is for an individual account. It does not include account deletion, billing controls,
workspace or member management, or video-processing preferences.

## Page Sections and Behavior

### Profile

- Show the current account name in an editable field.
- Trim surrounding whitespace and require a non-empty name before saving.
- Save through Better Auth's authenticated user-update flow. Show a pending state while saving,
  then an accessible success status or actionable error. Do not discard the entered value on a
  recoverable failure.
- Do not add an avatar editor or other profile fields in this version.

### Email and Sign-In

- Show the currently active sign-in email. Provide a field to request a different email address.
- Validate that the address is syntactically valid and is different from the current address.
- Require approval through a link sent to the current email address. After approval, send a
  verification link to the proposed new address. Keep the current email active until the new
  address has been verified.
- Show clear instructions after the request and after each confirmation step. Report an address
  already in use, delivery failure, expired or invalid link, and retry outcome without implying
  that the active sign-in email changed prematurely.
- Allow the user to restart an incomplete or expired change request. Users who cannot access the
  current email must use an out-of-band support process; account recovery is not added here.
- Keep email delivery vendor-neutral. The later application implementation must configure
  transactional delivery for both the current-address approval and new-address verification
  messages.
- Do not enable immediate email changes for unverified current addresses, and do not turn on a
  global email-verification requirement for signup or sign-in as part of this feature.

### Password

- Provide current password, new password, and confirm-new-password fields.
- Require all fields, require the new values to match, and enforce the existing email/password
  policy: 8 to 128 characters. The server remains authoritative for validation.
- Change the password through Better Auth's authenticated password-change flow, supplying the
  current password and requesting revocation of other active sessions.
- Keep the current session active. Show a success status and clear all password fields after
  success. Show a field-level or form-level error for an incorrect current password, invalid new
  password, or failed request, while preserving non-secret field values where safe. Never echo or
  log password values.

## Authentication and Data Requirements

- Use the existing Better Auth integration and authenticated client flows for updating the user
  name, requesting the email change, and changing the password. Do not create a parallel account
  API or duplicate Better Auth-owned user fields.
- Configure Better Auth email-change support to require current-address approval and new-address
  verification. Supply the vendor-neutral mail delivery integration for both messages.
- Preserve current signup and sign-in behavior. Existing unverified users must continue using
  their current email while an email change is pending.
- The existing `users`, `accounts`, `sessions`, and `verifications` tables provide the required
  account and verification storage. No database migration is anticipated; verify this against
  the installed Better Auth version during implementation.
- Do not expose account identifiers, verification tokens, passwords, cookies, or provider
  credentials in page content, logs, or client-visible errors.

## UI and Accessibility

- Follow the project's UI rules: clear section headings, one obvious save action per section,
  explicit pending/success/error feedback, and concise language.
- Reuse the authenticated app shell and existing design tokens and form controls.
- Make the page usable on narrow screens and desktop without horizontal scrolling.
- Associate every field with a visible label. Use appropriate autocomplete hints, keyboard
  accessible controls, visible focus, and live status/error announcements.
- Keep loading and request failures local to the relevant section so one failed action does not
  block other account controls.

## Acceptance Scenarios

The eventual application implementation should verify these scenarios:

1. An unauthenticated visitor to `/dashboard/settings` is redirected to `/login`; an authenticated
   visitor sees their own current account data.
2. Settings is an active, usable link from both desktop and mobile navigation; other navigation
   state and existing sign-out behavior continue to work.
3. A valid name change updates the displayed account name. Empty input is rejected, and server or
   network failure leaves the value available for correction or retry.
4. An email-change request sends approval to the current address. Before approval, the current
   address remains the sign-in address.
5. Approving through the current address triggers verification at the proposed new address. Before
   new-address verification, the old address remains active; after verification, the new address
   becomes active.
6. Invalid, unchanged, already-used, expired, or failed-delivery email requests receive clear
   feedback and can be retried without changing the active address.
7. Password submission rejects missing fields, mismatched confirmation, invalid length, and an
   incorrect current password. A successful change revokes other sessions and keeps the current
   session usable.
8. Profile, email, and password sections work independently and remain usable at mobile and
   desktop widths. Labels, focus, loading states, success messages, and errors are accessible by
   keyboard and assistive technology.

## References

- [RepurposePro UI Rules](ui-rules.md)
- [ADR 0008 — File retention with fenced cleanup](adr/0008-file-retention.md) — account and
  financial history are retained; account deletion is outside this feature.
- [ADR 0009 — Security boundaries and fail-closed mutations](adr/0009-security-boundaries.md)
- [Better Auth: User and Account Management](https://www.better-auth.com/docs/concepts/users-accounts)
- [Better Auth: Email and Password Authentication](https://www.better-auth.com/docs/authentication/email-password)
- [Better Auth: Session Management](https://www.better-auth.com/docs/concepts/session-management)
