# ADR 0010 — Read-only admin metadata boundary

Date: 2026-10-10. Status: Accepted for VS14.

## Context

An operator needs cross-user investigation without direct database access. Existing runtime,
payment and processing roles can access or mutate data beyond the admin specification.
Reusing those connections would make UI-only privacy controls insufficient.

## Decision

Authorize every API request and server data read using an existing Better Auth session and
one normalized server-only ADMIN_EMAIL. Missing identity fails closed. Keep reads private/no-store,
with explicit projections, bounded cursor lists and safe errors.

Use a separate repurposepro_admin login and DATABASE_ADMIN_URL without role memberships or URL
query overrides. Bootstrap tooling provisions the role before owner migrations. Migration 0047
grants user/project/payment/ledger metadata columns. Jobs use a view allowlisting failure codes;
raw error columns remain inaccessible.

PostgreSQL PUBLIC function execution cannot be denied to one role. Preserve effective execution
for the four existing application roles before removing PUBLIC execution on application functions.
Revoke PUBLIC default execution for future owner-created functions. New functions must grant
explicitly to their intended roles. Admin receives no application function execution or writes.

Historical metrics count records created in rolling UTC ranges, grouped by current status.
Current queued/active counts cover all dates. Payment totals retain currency/status and are not
a revenue calculation. Cursor timestamps preserve database precision.

## Consequences

No content previews, retries, account changes, credit adjustments, refunds, impersonation or exports.
Missing database configuration disables admin reads without breaking existing features. No worker,
ownership, financial-integrity or retention behavior changes. Database integration and browser
scenarios verify the boundary; cluster-wide test role provisioning runs sequentially and restores
development credentials afterward.
