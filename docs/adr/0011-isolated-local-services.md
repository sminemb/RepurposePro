# ADR 0011 — Isolated local account services

Date: 2026-10-16. Status: Accepted for local development.

## Context

The local database and API can be healthy while signup, login, and account mutations fail because
the machine cannot reach Arcjet. The same network restriction prevents Resend account emails.
Increasing timeouts does not make these local workflows usable.

## Decision

An explicit `LOCAL_SERVICES_ENABLED=true` opts local development into in-process action limits
and a private file email outbox. Validation requires `APP_ENV=local`, `NODE_ENV=development`,
and loopback application, API, auth, database, and Redis URLs. The default is false. Staging,
production, test environments, and remote database/Redis URLs reject this opt-in.

The web and API apply the existing action-specific limits, keyed by action and account identity;
anonymous web actions share a local bucket. Active windows are bounded to 1,000 entries and are
not evicted to admit new identities. Overflow is rate-limited until expired entries clear.
Authentication, session lookup, authorization, origin validation, body validation, and restricted
database roles remain in effect. This is a deliberate local provider, not a provider-error
fallback. Remote Arcjet failures still reject actions under ADR 0009.

Local password-reset and account-verification messages are written as private, uniquely named
JSON files under ignored `storage/local-mail/`. Recipient input never controls file paths. The
outbox contains sensitive, short-lived verification links and is never exposed by an HTTP route
or printed to application logs. Local messages are not sent to Resend. Production delivery is
unchanged. No database migration or remote deployment is needed.

## Consequences and verification

Local limits reset when a process restarts and do not provide distributed bot detection or WAF
inspection. They are intended only for isolated development. Existing remote environments keep
the original Arcjet provider, LIVE validation, timeouts, trusted ingress, and Resend delivery.
The flag must be false for local production builds. Unit and isolated browser test environments
explicitly disable the flag, preserving their existing real-protocol fixtures.

Regression coverage checks opt-in restrictions, action/user isolation, retry windows, bounded
memory, web/API protection, and private email delivery without provider calls. Local functional
verification must exercise signup, sign-in, account settings, password reset, and an authenticated
API action, rather than treating a healthy readiness endpoint as sufficient.
