# Production database migration to EC2

## Current status and gates

Production switched to a **fresh AWS database on October 29**, after the owner explicitly
confirmed that existing accounts, projects, credits and payment history would be unavailable.
No Neon data was imported or deleted. Staging remains on Neon and still has the exhausted Free
quota. The old production branch and original ignored connection files are retained.

The fresh database has all 50 repository migrations, exact Drizzle migration hashes/timestamps,
and six restricted roles with new credentials. Application tables were verified empty before
publication. Fresh initialization refuses to overwrite an existing database. A disposable
PostgreSQL integration fixture verified both initialization and overwrite refusal.

The five AWS production connection secrets, Vercel runtime URL and ignored production env files
now point to `db.re-purpose.pro`. TLS remains enabled and pool maximum remains two. The final
deployment is `dpl_61e73SSYZrQHrRYR3yWd9XiWnh2m`
(`repurposepro-lwm4npq18-sminembs-projects.vercel.app`), promoted to `re-purpose.pro` after session,
login and signup checks passed. `AUTH_MAINTENANCE_MODE=false`; API desired/running is 2/2 and
worker is 1/1, with no pending tasks. API readiness reports database and Redis up. Private API
and processing-role database sessions were observed using TLS. Existing Redis queues and stored
files were retained; no Redis flush or file deletion was performed.

The fresh schema's S3 PITR drill passed using backup `20261029-032113F`, target
`2026-10-29 03:21:16.399132+00`, with one-second WAL archival delay. Both database alarms were OK
at publication. Certificate renewal, public TLS and rejection of public privileged roles and
plaintext connections passed earlier live checks. The new runtime password was separately
verified over public trusted TLS without exposing its value.

The private rollback record is `.artifacts/database/fresh-secret-versions-before.json`; original
ignored env files are under `.artifacts/database/neon-connection-files-before/`. The new owner
and role credentials are in ignored `.env.database.ec2.production` and a root-only file on the
server. Never print or commit these files. Do not point back to old Neon after new writes without
reconciling the two datasets. Future recovery/import of old accounts or payments requires a
separate reconciliation plan; never blindly overlay the old dump onto the new database.

New users must register again. Complete real-account signup, email delivery and password-reset
completion with the owner's account; page readiness alone does not verify mailbox delivery.
The live browser sign-in probe currently receives `PROTECTION_UNAVAILABLE` HTTP 503 before
database authentication. A matching local synthetic Arcjet request identified the Shield error
`Failed to check shield block - contact Arcjet support`. Omitting Shield only in a diagnostic
request returned a successful bot/rate-limit decision. The owner explicitly chose **Keep Shield
enforced** after this diagnostic; no fallback or protection-mode change was deployed. Do not claim login or
reset delivery restored until this provider blocker is resolved and real-account checks pass.
The historical data-preserving migration procedure and October 29 provisioning record below
remain for reference, not as a requirement to wait until November 1 for this fresh deployment.

After explicit owner approval on October 29, the configured application-admin account was
created through Better Auth for `jakec0526@gmail.com`. Its generated password is stored only
in ignored `.env.admin.production`, with inherited Windows file permissions removed and access
limited to the local operator and SYSTEM. Password verification passed against the stored
Better Auth hash, and zero login sessions were created. The existing admin identity and
read-only admin authorization model were not changed. Shield remains enforced, so public
sign-in is still blocked until the provider error above is resolved. Never commit or copy
the credential file into this document, logs, screenshots, or chat.

The original export window was **2026-11-01 08:00 Asia/Manila** (`2026-11-01T00:00:00Z`).
On October 29 the owner explicitly requested migration immediately instead of waiting. Use
`--early-migration-authorized` on both `migrate.py export` and the workstation publication command
for that authorized cutover. This changes only the calendar gate; source access, maintenance,
draining, verified restoration, fresh recovery proof and all other checks still apply.
The production API access check and a separate direct PostgreSQL connection both still fail
with Neon's quota-exceeded error (HTTP 402 / SQLSTATE 53000). Export remains blocked by Neon until
access is restored, for example by the owner upgrading the organization or obtaining export
access from Neon support. No billing change was made by this work.
The migration must preserve existing data. Do not initialize an empty replacement
for production while Neon is inaccessible. The source is project `late-lake-42220882`, branch
`br-crimson-leaf-b3iyv97b`, direct endpoint `ep-flat-math-b3h6holc.c-4.ap-southeast-1.aws.neon.tech`.

Execution prerequisites:

- The administrator applied the three permission policies on October 29. Their initial documents
  matched the prepared package. Official pricing and the Ubuntu AMI parameter are now readable.
  Deployment policy version v3 is confirmed as the default and validation reads succeed.
  `ReadDatabaseDeploymentValidation` uses `Resource: "*"` for this one read-only action with a
  Singapore region condition. This permits reading event metadata across the account's Singapore
  deployments; it grants no write or database-data access. The earlier scoped authorization
  failure's underlying cause is not confirmed.
- AWS CLI browser sign-in completed on October 29 for `RepurposeProDeploy` in account
  `402365884836`. Sessions expire; verify identity again before each deployment or cutover.
- Vercel CLI browser sign-in completed on October 29. Project inspection confirmed team
  `team_e7CIRczmAx2mkj4VhgmlxVWJ`, project `prj_vl8g2epXmcanKhVKjAgYQB58OHqn`, name
  `repurposepro`, root `apps/web`. Do not create or relink another project.
- Verify official total cost is at most **$25/month** before provisioning. The published unit
  prices must be obtained successfully; a third-party quote or unavailable rate does not pass.
- Public DNS access is needed to add **only** `db.re-purpose.pro`. Web/API DNS remains unchanged.
- Alerts go to **sminemb@gmail.com**. The owner must confirm the AWS SNS subscription email
  before cutover; the publication tool enforces a confirmed subscription and healthy alarms.

Nothing schedules a future unattended cutover. Resume the runbook when these prerequisites and
source access are satisfied.

October 29 preflight: official rates produced a **$24.56/month before-tax** estimate under the
assumptions below. After validation reads succeeded, a fresh preflight and change set
`database-20261029021515` passed with 19 additions only and no validation findings. The wrapper
executed that change set at 10:15 AM Manila; the stack reached `CREATE_COMPLETE`.
The earlier `database-20261029015458` review change set was not executed. Production connections
and source data remain unchanged.
The provisioned instance is `i-0ff8cbb4dadc10a3e`, public IP `54.254.161.143`, private IP
`172.31.34.192`, retained data volume `vol-043224bde4fa91727`, private DNS zone
`Z06954981079XAAQ3QWYP`. SSM is online; ARM64, IMDSv2 and encrypted retained data storage were
verified. The email subscription is confirmed, and public `db.re-purpose.pro` resolves to the
Elastic IP. Reviewed `migrate.py` and `inventory.sql` were staged under `/opt/repurposepro-migration`
and their SHA-256 hashes checked against the workstation copies; no source credentials were staged.

Initial bootstrap stopped after creating the empty cluster because the PGDG package did not
create `conf.d`. The reviewed bootstrap now explicitly creates and enables it. Setup was resumed
only from the configuration step through SSM, with the cluster stopped and its version checked;
the data volume was not reformatted and the cluster was not recreated. PostgreSQL, backup/monitor
timers, and the first S3 backup are running. Cloud-init retains the historical failed first-run
status; readiness is tracked by `/var/lib/repurposepro-database/bootstrap-complete` and live checks.
The corrected local bootstrap is staged in `migration/tools/bootstrap.sh`; the existing stack's
original user-data template is not replaced automatically. Future instance recovery must use the
corrected source and retained-volume runbook.

The initial workstation wait ended after two minutes while AWS continued successfully. The
wrapper now allows a longer wait for CloudFormation operations; do not rerun a deployment merely
because a workstation wait expires. Inspect the live stack first.

October 29 live readiness checks passed:

- PostgreSQL 17.11, `archive_mode=on`, five-minute WAL switching and SCRAM are active. The private
  VPC resolver returns `172.31.34.192`; public DNS returns `54.254.161.143`.
- Let's Encrypt issued the trusted certificate, expiring January 27, 2027. Renewal dry-run passed.
  An initial TLS restart exposed root-only configuration-file permissions under `umask 077`.
  The bootstrap and TLS installer now explicitly set configuration files to root:postgres 0640,
  and the renewal hook reloads only an active PostgreSQL service. The corrected assets are
  installed on the host and staged in the private migration-tools prefix.
- An external workstation verified the certificate chain and hostname using TLS 1.3, a SCRAM
  challenge for the runtime role, HBA rejection for all five privileged role names, and rejection
  of unencrypted connections. This does not prove credential-based login: the six application
  roles and application database are intentionally not created before source inventory.
- Both CloudWatch alarms are OK and target the confirmed email subscription. Full/differential
  backup, health-monitor and certificate-renewal timers are enabled. Sampled backup objects
  reported AES256 encryption.
- The empty-target S3 recovery drill passed at `2026-10-29 02:42:02.899752+00` using backup set
  `20261029-024200F`, with WAL archival delay of one second. The earlier probe existed and the
  later probe was excluded. The temporary restored cluster was stopped and removed successfully.
  Repeat the drill after production restoration; this early proof is not a cutover acceptance
  report and will expire before November 1.

No Neon export, production credential rotation, application deployment, maintenance activation,
or service-count change occurred during these readiness checks. Next: resume source inventory
on or after November 1 at 08:00 Manila, then follow the maintenance and cutover procedure below.
After the successful live checks, both the AWS connector and workstation session expired during
an additional final read. Reauthenticate before further AWS operations and recheck identity,
stack state, both alarms, and production ECS counts at the start of the next session. The last
successful stack read was `CREATE_COMPLETE` and both alarms were `OK`; the additional read did
not change resources. The two ECS desired counts were not modified by this work.
Durable CloudTrail configuration could not be inspected because `cloudtrail:DescribeTrails`
is not granted; account audit retention remains unverified.

## Infrastructure and cost

`pnpm db:server:build` generates `.artifacts/database/production-database.cloudformation.json`
from the declarative template and reviewed bootstrap assets in `infra/database`. Generated user
data is gzip-packed and checked against EC2's 16 KiB limit; it contains no credentials.

The stack is `RepurposePro-Production-Database`, account `402365884836`, Singapore. It uses the
existing VPC and public subnet in `ap-southeast-1a`, one Ubuntu 24.04 ARM64 `t4g.small`, and
**20 GiB total** encrypted gp3 storage: an 8 GiB disposable OS disk plus a 12 GiB retained data
volume. A future larger volume needs a fresh estimate and a recovery review. CPU credits use
Standard mode so sustained load cannot create unlimited-credit charges.

Data volume, backup bucket and private DNS zone have both deletion and replacement retention.
CloudFormation completion does not prove cloud-init, TLS or recovery readiness. The bootstrap
refuses to format an unknown filesystem and stops if a retained PostgreSQL cluster already exists.
Instance replacement is a recovery operation, not an ordinary rolling application deployment.

`pnpm db:server:cost -- --profile <deployment-profile>` uses AWS Price List APIs and writes a
dated report in `.artifacts/database/cost-report.json`. It accounts for 744 running hours, 20 GiB
EBS, IPv4, 10 GiB of S3 including retained versions, private DNS, four custom metrics, two alarms,
and a $1 reserve for small request/transfer/notification charges. It assumes no promotional
credits, NAT gateway, replica or paid Vercel egress feature. Variable usage and tax are not a
hard spending cap; monitor the estimate against actual billing and backup size. Ambiguous rates,
wrong account, expired reports and totals over $25 stop deployment.

The database exposes verified PostgreSQL TLS for Vercel's dynamic egress. Public `pg_hba.conf`
permits only `repurposepro_runtime` on `repurposepro`; all other database roles require the VPC
or local administration. Plaintext TCP and IPv6 database access are rejected. EC2 administration
uses SSM without inbound SSH. Private DNS maps the same certificate hostname to the private IP
for ECS. Keep `DATABASE_SSL=true` and do not add URL options that override certificate validation.

## Administrator permission package

Review the three JSON documents in `infra/database`. Each is below IAM's 6,144-character managed
policy limit when compacted. Apply them as **new managed policies**, preserving the existing
nearly-full CloudFormation inline policies:

| Policy name | Document | Attach to role |
| --- | --- | --- |
| RepurposeProProductionDatabaseDeployment | `deployment-permissions.json` | RepurposeProDeploy |
| RepurposeProProductionDatabaseCompute | `execution-compute-permissions.json` | RepurposeProCloudFormationExecutionRole |
| RepurposeProProductionDatabaseStorage | `execution-storage-permissions.json` | RepurposeProCloudFormationExecutionRole |

For each row, an administrator uses `aws iam create-policy --policy-name <name>
--policy-document file://infra/database/<document>` and `aws iam attach-role-policy
--role-name <role> --policy-arn arn:aws:iam::402365884836:policy/<name>`. If a named policy already
exists, inspect its current version and review a version update; do not silently replace it.
Route 53 hosted-zone creation needs a global create permission; record changes are restricted
to the database A record. Retaining the zone avoids granting broad hosted-zone deletion rights.
The EC2 instance role itself has no production Secrets Manager write permission.

## Prepare the host without touching production

1. Confirm the AWS account and selected VPC/subnet/AZ. Obtain the production task security-group
   ID from the existing runtime stack's `TaskSecurityGroup` resource. Do not use staging's group.
2. Run `pnpm db:server:cost -- --profile <deployment-profile>` and review its full output.
3. Run `pnpm db:server:deploy -- --profile <deployment-profile> --task-security-group <sg-id>
   --alert-email sminemb@gmail.com` to create a reviewable change set. The wrapper recomputes
   prices and rejects deletions or conditional/definite resource replacements.
4. Repeat with `--execute` after reviewing the intended new resources. This creates infrastructure
   only; it does not export data, publish connection strings or restart applications.
5. Confirm the SNS email subscription. Read the stack outputs for the instance ID, addresses,
   backup bucket and alarm topic. Connect to that instance through SSM.
6. Wait for `/var/lib/repurposepro-database/bootstrap-complete`. Inspect cloud-init on failure;
   never force a format or rerun cluster creation over a retained volume.
7. Add the public DNS A record `db.re-purpose.pro` pointing to the stack's Elastic IP. Verify
   it using a public resolver. The private VPC resolver intentionally returns the private IP.
8. Through SSM run `sudo /usr/local/sbin/repurposepro-database-tls`. This obtains a Let's Encrypt
   certificate, installs a renewal hook, and enables TCP listeners only after issuance succeeds.
   Test public verified TLS, private hostname resolution, runtime access and rejection of public
   owner/billing/processing credentials. Test `certbot renew --dry-run`.

The server has Python 3, OpenSSL and PostgreSQL 17 client tools. Upload the reviewed files from
`scripts/database` under `migration/tools/` in the private bucket and copy them to a root-owned
`/opt/repurposepro-migration` through the instance role's boto3 client. Compare SHA-256 checksums
with the reviewed repository before execution. Never put source files containing credentials
in Git, shell command strings, SSM command parameters, screenshots or logs.

Use private `0600` files in `/root` for credentials and `0700` working directories. If credentials
are staged through S3, use `migration/private/`, keep default encryption and TLS, then remove the
staged files when transfer is complete. The instance role can read migration tools and write only
private migration artifacts. Protect source-owner access separately from application credentials.

## Inventory, maintenance, and export

Run the following on the new database host through SSM, as root. Use `python3`; the repository
`pnpm db:server:*` wrappers are for the workstation. Stage the existing source migration-owner
URL as `DATABASE_MIGRATION_URL` in `/root/neon-source.env`, without printing its contents.

```sh
umask 077
install -d -m 700 /root/database-migration
cd /opt/repurposepro-migration
python3 migrate.py inventory --source-env /root/neon-source.env --out /root/database-migration/inventory.json
python3 migrate.py prepare-roles --credentials /root/database-migration/target.env
```

Inventory verifies PostgreSQL 17, schemas, encoding/locale and source permissions without changing source data.
Unexpected extensions, provider-role ACLs, role memberships or owners stop export for review.
Extra application schemas and non-libc/non-UTF8 databases also stop transfer for review. The
fresh target database uses the source libc collation and character classification, and fails
creation if the target OS lacks that locale instead of silently changing comparison behavior.
The tool creates six fresh target roles and refuses implicit password rotation if they exist.
Its target is always the local PostgreSQL Unix socket; a target URL cannot accidentally point
restore at Neon or staging. Store the new target credentials securely without exposing values.

Before the final export:

1. Deploy the maintenance-gate code to the existing Vercel production project with
   `AUTH_MAINTENANCE_MODE=true`. Verify `/api/auth/get-session` returns HTTP 503 with code
   `AUTH_MAINTENANCE`, `Cache-Control: no-store` and `Retry-After: 300`. GET callbacks, session
   refresh, internal Better Auth calls and dedicated sign-out are all gated. Values other than
   an absent flag or literal `false` fail closed.
2. Prevent new API writes, allow active jobs to finish, and then set the production API and
   worker ECS service desired counts to zero. Verify running and pending counts are also zero.
   Preserve Redis queues and schedulers, storage, Stripe endpoint settings and credit records.
   The load balancer must return failures for stopped webhook handlers, allowing Stripe retry;
   never acknowledge an unprocessed event. Record any outage older than Stripe's retry window
   for explicit replay after recovery.
3. Wait until source application database connections disappear. Expired or active job leases
   must be reconciled through the existing application lifecycle; do not edit job or ledger rows
   to make migration checks pass. No other migration owner or administrator may write during
   this window. If anything remains active, stop before export.
4. Set `MIGRATION_ARCHIVE_PASSPHRASE` interactively without echoing it (for example,
   `read -r -s MIGRATION_ARCHIVE_PASSPHRASE; export MIGRATION_ARCHIVE_PASSPHRASE`). Use a random
   independent secret of at least 32 characters and store it outside the host for recovery.

```sh
python3 migrate.py export --source-env /root/neon-source.env \
  --archive /root/database-migration/source.dump.enc --maintenance-confirmed
```

The export takes SHARE locks and a repeatable-read snapshot across application tables. It
checks for writers before and after copying and checks sequence state twice. It streams a custom
archive through AES-256-CBC with PBKDF2 and authenticates the entire ciphertext and manifest with
separate HMAC keys. Partial files without a valid manifest are never accepted. Archive contents
include `public` and `drizzle`, ACLs, functions, indexes, constraints, triggers and sequence state;
provider-managed schemas and source database passwords are not copied.

Copy the encrypted archive and its adjacent `.json` manifest off-host to the private S3 migration
prefix before proceeding. Protect the passphrase independently. Never upload a plaintext dump.

## Restore, verify and publish

Use the **same final export** for rehearsal and production restoration. Existing target databases
are never overwritten. A failed target stays quarantined for inspection; only explicit cleanup of
the disposable rehearsal is permitted. Do not drop a live production database to retry a tool.

```sh
python3 migrate.py restore --archive /root/database-migration/source.dump.enc \
  --database repurposepro_rehearsal --report /root/database-migration/rehearsal.json
python3 migrate.py restore --archive /root/database-migration/source.dump.enc \
  --database repurposepro --rehearsal-report /root/database-migration/rehearsal.json \
  --report /root/database-migration/production.json
sudo /usr/local/sbin/repurposepro-database-backup full
sudo /usr/local/sbin/repurposepro-database-restore-drill
```

Verification compares every row via a sorted SHA-256 digest, table counts, auth account/session
data, identities, sequence values and `is_called`, schema objects, constraints, triggers, RLS,
ACLs including column grants, six role boundaries, and Drizzle history. Security-definer function
ownership remains `repurposepro_owner`. Global default privileges and special initial public
schema grants are replayed explicitly, because a schema-filtered dump omits some of them.

The physical recovery drill takes a full backup to S3, commits a disposable probe in the
`postgres` database, waits for its WAL, then commits a later probe. It restores to an isolated
data directory and private socket on port 55432. Success requires the first probe to exist and
the later one to be absent, with WAL archival within 900 seconds. Application tables and the
live cluster are untouched. Success removes the temporary restore; failure preserves private
logs and data for diagnosis. Check free space before repeating a failed drill.

The report is `/var/lib/repurposepro-database/last-restore-drill.json`. Download the target env,
authenticated production verification report and recovery report privately to the workstation.
The `verify` subcommand can recheck an existing target into a new report if the original report
was lost or becomes older than one hour; it never replaces data.

```sh
python3 migrate.py verify --archive /root/database-migration/source.dump.enc \
  --database repurposepro --report /root/database-migration/production-fresh.json
```

Keep Vercel maintenance enabled and ECS stopped. On the authenticated workstation:

```sh
pnpm db:server:publish -- --profile <deployment-profile> \
  --target-env .env.database.ec2.production \
  --verification-report .artifacts/database/production-fresh.json \
  --recovery-report .artifacts/database/last-restore-drill.json \
  --rollback-record .artifacts/database/secret-versions-before-cutover.json
```

The publisher requires the archive passphrase, authenticated recent production verification,
recent successful recovery proof, live Vercel maintenance, the correct AWS account, both ECS
services stopped, a confirmed alert subscription, and both CloudWatch alarms in OK. It writes
only the five restricted application connection secrets, never owner credentials. Values are
supplied through private temporary files; the rollback record contains version IDs only. If any
write fails, keep maintenance enabled and services stopped while correcting or rolling back the
partially updated secret set.

Through the reauthenticated Vercel connector or CLI, update production `DATABASE_URL` to the
new **runtime** URL and retain `DATABASE_SSL=true`, pool maximum two and maintenance true.
Preserve `BETTER_AUTH_SECRET`, trusted origins, cookie scope and every unrelated variable. Update
ignored local production env files while preserving old Neon administration credentials separately
for the rollback window. Deploy and verify the correct project and target connection; never
print env values. No Neon adapter or application schema migration is needed.

Restart the API first using the original desired count (currently two), verify readiness and
private database connections, then restart the worker (currently one). Keep interactive writes
blocked until this decision point. **Restarting the worker admits production writes**, so treat
that as the end of simple connection-only rollback. Remove Vercel maintenance only after the
validation below; backend writes after reopening use the new database exclusively.

## Acceptance and rollback

Before reopening: trusted TLS works from Vercel and ECS, no owner/billing/processing role can
authenticate publicly, source counts and digests match, the backup and PITR drill pass, both
alarms are OK, and email subscription is confirmed. Recheck Neon for stale application clients.
Do not expose connection strings or select raw password/session values into validation logs.

After reopening, verify an unexpired existing session, login, password-reset mail and reset,
old-password rejection and all-session revocation, project reads, a controlled worker job, and
Stripe replay without duplicate credit. Preserve original session expiry; do not extend expired
sessions. Use the normal test account and existing Stripe sandbox configuration. Record the
outcomes and monitor database, API, worker, TLS and backup health through the first day.

Before any new production writes, rollback means keeping maintenance on, restoring all five
AWS secret versions from the saved IDs with `update-secret-version-stage`, restoring Vercel's
old runtime URL, redeploying, and restarting on Neon only after checking source availability.
After any API/worker/user writes on EC2, **do not point clients back to the old Neon copy**.
Keep maintenance on, stop writers, and either repair EC2 or reconcile/export the new writes
before a reverse migration. Restoring an old backup without reconciliation can lose payments.

Keep the Neon production branch unchanged for at least seven days after a successful cutover.
No deletion tool is included. Staging remains on Neon throughout. Remove staged credential copies
and private restore files after verifying durable backups and secure recovery access.

Weekly full and daily differential backups retain two full generations; S3 version history is
also retained for 30 days. Do not attach lifecycle expiration to live pgBackRest WAL. Monitor
disk use (80%), backup age (26 hours), WAL lag (10 minutes), certificate expiry (seven days),
EC2 status and missing health metrics. If WAL lag grows beyond the recovery target, report
degraded protection and address it promptly. Rehearse S3 restoration after backup configuration
changes and before relying on a replacement instance.

## Local validation

Verified locally on 2026-10-26:

- 938 Vitest unit tests passed, plus 137 existing PostgreSQL/Redis integration tests. The latter
  used the existing local owner/runtime connections supplied as `TEST_DATABASE_*` process variables
  and `LOCAL_SERVICES_ENABLED=false`; the repository wrapper restored development roles afterward.
  The ignored local env files were not rewritten.
- All four password-recovery Playwright scenarios passed. The built app was also checked in a
  browser with maintenance enabled: reset-link submission returned `AUTH_MAINTENANCE` HTTP 503,
  `Cache-Control: no-store`, `Retry-After: 300`, and safe temporary-unavailability feedback.
- All 50 migrations transferred successfully in the isolated migration fixture, including opaque
  account/session records and sequences; modified data was rejected by verification.
- TypeScript, ESLint, production build, cfn-lint 1.58.0 and the five Guard 3.2.1 rules passed.
  The production build retained the existing Next.js file-tracing warning.
- The whole-repository formatting check flags the unchanged generated
  `packages/db/drizzle/meta/0048_snapshot.json`; do not mix unrelated generated-file formatting
  into this migration. Changed TypeScript/JSON files are checked separately.

These results do not prove live AWS bootstrap or S3 recovery, which remain explicit cutover gates.

- `pnpm db:server:test`: portable cost, encryption-authentication, source/destination and cutover
  safety tests. Python 3 is required; no AWS credentials or database are used.
- `pnpm db:server:test:integration`: Docker builds an isolated PostgreSQL 17 test image, applies
  all repository migrations, transfers fake user/account/session and sequence records, rehearses
  restoration, verifies a production fixture and detects changed data. It publishes no ports,
  has no container network, and removes only its unique disposable container afterward.
- `pnpm db:server:build`, `cfn-lint` against the generated JSON, shell syntax checks, repository
  lint/typecheck/tests, and CloudFormation `ValidateTemplate` cover the deployable artifacts.
- Guard 3.2.1 with `infra/database/database.guard` checks retained encrypted storage, private
  encrypted backups, IMDSv2, SSH ingress and missing-metric alarms. Validation binaries belong
  in ignored tooling directories; they are not application dependencies.
- Actual AMI/bootstrap, certificate renewal, CloudWatch delivery and S3 PITR are live acceptance
  checks and remain pending until cost, permissions and infrastructure are available.

Official references: [PostgreSQL 17 pg_dump](https://www.postgresql.org/docs/17/app-pgdump.html),
[pg_restore](https://www.postgresql.org/docs/17/app-pgrestore.html),
[pgBackRest configuration](https://pgbackrest.org/configuration.html), and
[CloudFormation retention](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-attribute-updatereplacepolicy.html).
