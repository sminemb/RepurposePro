# ADR 0012 — Production PostgreSQL on a dedicated AWS server

Date: 2026-10-26. Updated: 2026-10-29. Status: Accepted; fresh production cutover complete.

## Context

Production and staging share a Neon Free project. Exhausted compute suspended both endpoints
and prevented password recovery. The owner selected production-only migration to AWS Singapore,
a $10–25 monthly database budget, a maintenance window, and a 15-minute recovery target.

## Decision

Use PostgreSQL 17 on a single ARM64 EC2 instance in the existing VPC. Keep staging on Neon.
Retain encrypted database storage independently of compute and use pgBackRest full/differential
backups with continuous WAL archiving to private encrypted S3. Prove point-in-time restoration
before cutover. This budget provides recovery from backups, without automatic failover.

Keep the existing six roles and application schemas. Public verified TLS permits only the web
runtime role because Vercel has dynamic outbound addresses; backend and administrative roles
remain private. ECS uses private DNS for the same certificate hostname. SSM replaces SSH ingress.
Certificate renewal, stale backups, WAL lag, disk use and host health are monitored.

Default-off auth maintenance gates HTTP and internal Better Auth calls. Stop backend writers,
export an authenticated encrypted consistent snapshot, rehearse, compare data and permissions,
then publish connections. The source export must wait until November 1 at 08:00 Asia/Manila;
no empty replacement or implicit Neon upgrade was originally authorized. Official cost exceeding $25 or
unavailable cost/access checks block provisioning.

On October 29, the owner first authorized an earlier migration, then explicitly selected and
confirmed an empty production start after both Neon API and direct PostgreSQL access remained
quota-blocked. This supersedes the requirement to import existing data for this cutover. Apply
the repository's 50 migrations with their actual Drizzle hashes/timestamps, verify empty
application tables and all six restricted roles, and require explicit fresh-start publication
authorization. Keep old Neon data, stored files and original connection files intact. Existing
users must register again; previous projects, credits and payment history are unavailable in
the fresh application. Do not merge old and new records automatically later.

## Consequences

The application keeps standard PostgreSQL interfaces and unchanged session-signing secrets.
Operations now own patching, certificate renewal, backup monitoring, capacity and restore drills.
A host failure can cause downtime. Rollback after new writes requires reconciliation; changing
URLs back to a stale database is unsafe. Retain Neon production for at least seven days and
make no staging changes. See [the migration runbook](../database-server-migration.md).
