# Password recovery

Sign-in links to `/forgot-password`. An anonymous visitor submits their email and sees the same
confirmation whether the account exists or not. `/reset-password` accepts the link supplied by
Better Auth, asks for a new password and confirmation, then offers sign-in. Missing, expired and
used links offer another reset request. Signup also requires an exact password confirmation.
Passwords use the existing 8–128 character policy and are never trimmed. Every password input
on these authentication pages has its own accessible show/hide button.

## Authentication and delivery

The existing web-owned Better Auth handler serves `POST /api/auth/request-password-reset` with
`email` and `POST /api/auth/reset-password` with `token` and `newPassword`. The reset request hook
fixes the callback to `APP_URL/reset-password`. Tokens use the existing verification table, expire
after one hour, and can only be consumed once. Successful resets revoke all sessions and do not
automatically sign in. Password confirmation is a browser check and is not sent to Better Auth.

Reset emails reuse `RESEND_API_KEY` and `RESEND_FROM` on the web server, with the sender already
verified in Resend. Both settings are required in staging and production. If local email delivery
is unconfigured, every address gets the same `EMAIL_DELIVERY_UNAVAILABLE` response before account
lookup. No new environment variable or database migration is required.

Next.js `after()` schedules delivery after the response, so provider timing and failures do not
reveal account existence. Failed delivery logs only `password_reset_email_failed`, without email
addresses, links, provider responses or tokens. Visitors can request another link if no email
arrives. Account-settings emails retain their existing delivery feedback.

Arcjet protects anonymous reset requests at three attempts per ten minutes per IP, and reset
submissions at five attempts per ten minutes per IP, using separate action windows. Its existing
fail-closed behavior, trusted-ingress handling and origin checks continue to apply. The reset
page uses `Referrer-Policy: no-referrer` and private/no-store caching; Next.js development request
logging omits reset URLs. The token is removed from the current URL after success.

## Verification and release

Unit/integration tests exercise confirmation boundaries, real Better Auth reset tokens,
expiration, reuse, session revocation, email availability, provider failure and protection.
The isolated browser suite captures reset emails without sending to Resend and checks the full
flow, keyboard-operated visibility controls, error states and responsive layouts.

Run `pnpm ci:check` before release. Deploy and smoke-test the existing staging web target before
production. This change does not require an API/worker rollout or infrastructure changes.
Rollback consists of restoring the preceding web deployment; preserve the database and its
account state. Passwords already reset remain changed after rollback.

References: [Better Auth email/password](https://better-auth.com/docs/authentication/email-password),
[Next.js after](https://nextjs.org/docs/app/api-reference/functions/after).
