# Production deployment

Deployed 2026-10-14, Asia/Manila. Production web and API are live over verified HTTPS, while Stripe
remains in sandbox mode.

## Completed preparation

- Neon production branch `br-crimson-leaf-b3iyv97b` is isolated from staging. Endpoint:
  `ep-flat-math-b3h6holc.c-4.ap-southeast-1.aws.neon.tech`. All six application role passwords
  were independently generated. There are 48 migrations, 29 application tables and zero rows.
- Stripe sandbox webhook `we_1UQHCaFfO8YnaNpSXuINhj4d` targets the production API. Stripe
  confirmed `livemode: false` for the endpoint and all three active configured prices.
- Vercel has 14 production-only configuration variables. Private configuration remains in
  ignored `.env.production`; database administration is separated into `.env.database.production`,
  and queue provisioning credentials / Stripe endpoint metadata into `.env.deployment.production`.
  Each scope has a committed `.example` template. No credential values were printed. See the
  [environment file strategy](env-reference.md#2-environment-file-strategy) for explicit selection.
- Vercel production deployment `dpl_E2hQ3x8zv84ZoR7bcucWG2GEZxmZ` is READY at
  `https://repurposepro-weou2iopo-sminembs-projects.vercel.app`. It was built with `--skip-domain`.
  Its home, login, signup and `/api/auth/get-session` routes returned HTTP 200 through existing
  owner authentication. The remote build and TypeScript checks passed. The build reported an
  existing Next.js file-tracing warning from shared configuration.
- `RepurposePro-Production-Configuration` reached CREATE_COMPLETE with nine provider/database
  secrets. The runtime stack will create REDIS_URL and BETTER_AUTH_SECRET separately.
- The final 33-resource production runtime change set `production-runtime-1791943230249` was
  AVAILABLE and executed using the issued certificate ARN. The runtime stack is CREATE_COMPLETE.
  The certificate stack is UPDATE_COMPLETE.
- Both ECS rollouts are COMPLETED: two desired/running API tasks and one desired/running worker,
  with zero pending tasks. API containers and both load-balancer targets are healthy. Worker
  container health is UNKNOWN because no container health check is configured, but it is RUNNING.
- Public API readiness returned its `status: ok` response over normal DNS and verified HTTPS,
  with database and Redis both up. A 30-minute startup log scan found zero error events in
  167 API events and 12 worker events. No media job was submitted.
- Vercel promotion confirmed the READY web build is already the current production deployment
  (HTTP 409 for the idempotent promotion attempt).
- Both GoDaddy authoritative servers publish only the two Vercel apex addresses, and Vercel's
  domain check reports `misconfigured: false`. The old Parked record was removed.
- Vercel certificate `cert_s8BnhcvGe0DurSx1FvhZUsBy` was issued for `re-purpose.pro` with automatic
  renewal enabled. After refreshing domain verification and requesting issuance, public HTTPS
  returned HTTP 200 with `Server: Vercel` and the expected RepurposePro page title.
- Anonymous production home, login, signup and session routes all returned HTTP 200 through the
  normal hostname. The API rejects an unauthenticated projects request with HTTP 401; production
  checkout CORS preflight returns HTTP 204, the exact web origin and credentials support.
- Final Stripe reads reconfirmed the webhook and all three active prices are sandbox-only. Final
  database reads still show 48 migrations, 29 application tables and zero application rows in
  both production and staging. No signup, email, checkout, credit grant or media job was created.
- Both production execution policies were attached to the CloudFormation execution role with
  explicit user approval. Root was used only for approved policy creation/attachment; normal
  deployment operations use RepurposeProDeploy.

## Target and isolation

- AWS account `402365884836`, region `ap-southeast-1`.
- Vercel project `sminembs-projects/repurposepro` (`prj_vl8g2epXmcanKhVKjAgYQB58OHqn`).
- Web: `https://re-purpose.pro`; API: `https://api.re-purpose.pro/api/v1`.
- Source: staging commit `a6d1d7b`; reuse the immutable API and worker image digests recorded in
  [staging-deployment.md](staging-deployment.md).
- Production uses its own Neon branch, ECS cluster, EFS filesystem, queue, secrets and auth key.
- Stripe uses the existing sandbox account and sandbox prices. Production receives a separate
  sandbox webhook endpoint. Abort setup if the key is not `sk_test_`, a price is live, or the
  webhook reports `livemode: true`.

## Infrastructure

`infra/production-runtime.cloudformation.json` creates 33 resources: two API tasks, one CPU worker,
an HTTPS load balancer, private storage and a two-node Valkey queue with multi-AZ failover.
The queue retains seven daily snapshots; logs retain 30 days. The private subnet ranges
`172.31.50.0/24` and `172.31.51.0/24` were checked against the current VPC subnet inventory.
ARCJET remains LIVE. Containers run as UID/GID 1000. Stateful storage and secrets are retained.

The production ECS execution role is separate and reads only the eleven production secret names,
the two verified image repositories and the production log groups. Existing application task roles
remain in use; they are already explicitly identified in the staging deployment.

## Required AWS permission approval

The three existing CloudFormation execution-role inline policies occupy 10,184 of the 10,240
allowed characters. Preserve these approved staging policies. Production requires two additive
customer-managed policies, attached only to `RepurposeProCloudFormationExecutionRole`:

- `infra/production-execution-permissions-1.json`: 5,398 compact JSON characters.
- `infra/production-execution-permissions-2.json`: 5,380 compact JSON characters.

Both remain below the 6,144-character managed-policy limit. Together they authorize the same
regional infrastructure operations as staging, scoped to production names or production tags,
plus creation of the exact production cluster and `RepurposeProProductionEcsExecutionRole`.
The IAM role-management statement only targets that execution role; PassRole only grants access
to the explicitly listed ECS roles and the ECS task service. The certificate request permits only
the exact `api.re-purpose.pro` DNS certificate. There is no permission to fetch application secrets
for the deployment agent. Metadata reads required by CloudFormation are retained.

The current `RepurposeProDeploy` session cannot create or attach managed policies. A suitably
authorized AWS administrator session must apply the reviewed policy files. Do not infer approval
for these access changes from the earlier staging permission approvals.

## Validation

The installed cfn-lint validates all three production templates with zero errors. Runtime warnings
are the two fixed availability zones (chosen to match existing public subnets) and the NoEcho cache
authentication parameter. Bootstrap and certificate templates have no findings.
Applicable installed AWS registry security rules passed with no violations. The host-networking
rule does not apply to Fargate; the Redis-only transit rule does not select Valkey, whose TLS is
checked directly in the template. The HTTPS certificate ARN parameter and HTTP redirect listener
retain the documented staging rule exceptions. AWS change-set validation must be checked again
for the final certificate ARN before execution.

## Certificate retry

The certificate stack failed initial tagging because the bootstrap-derived policy checks existing
resource tags before they have been applied. The first correction targeted the initial exact ARN;
the retry created a different ARN and encountered the same failure. The corrected tagging policy
uses `aws:RequestTag/Project=RepurposePro` and `aws:RequestTag/Environment=production` for initial
tagging. Metadata reads use existing production resource tags. These supported keys are documented
in the [ACM authorization reference](https://docs.aws.amazon.com/service-authorization/latest/reference/list_acm.html).
The user approved publishing these corrected policy versions, and both managed policies now use
version v2. The certificate template also includes explicit Project and Environment tags so the
first authorization check receives them. The certificate is ISSUED at ARN
`arn:aws:acm:ap-southeast-1:402365884836:certificate/5c5c4e23-b08f-4c19-9ed6-dc116216af12`.
GoDaddy authoritative DNS and Google's public resolver both confirmed the validation CNAME.

The deployment role can now read production certificate metadata after IAM propagation.
`DescribeEvents` still returns AccessDenied even with the approved scoped stack/change-set
resources. Keep this denied read explicit; the local schema/security checks and available change
set are the validation evidence obtained. Do not broaden the event-read policy without approval.

The DNS validation record is stable across certificates for this domain:

- Name: `_b056a8121a995f6900d0b1c70312fef9.api.re-purpose.pro`.
- Type: CNAME.
- Value: `_0526855613712992ef707d72c68432f5.wzccmgtwzk.acm-validations.aws`.

The user added the validation record in GoDaddy because regular Chrome control is unavailable
in this chat. Keep it for renewal. The production web apex still has GoDaddy parking A records.
After adding the domain to the Vercel project, its first-ranked apex recommendation is
`216.198.79.1` and `64.29.17.1`; `76.76.21.21` remains the second-ranked fallback. The domain is
verified and apex DNS is configured. Both apex A records have a 600-second TTL. The API load balancer CNAME is
`repurposepro-production-api-937443546.ap-southeast-1.elb.amazonaws.com`. The user confirmed
adding it as the GoDaddy `api` CNAME. An initial incorrect target was corrected. Both authoritative
GoDaddy DNS servers now return the load balancer target, and normal public API requests succeed.

## Production release artifacts

- Web deployment: `dpl_E2hQ3x8zv84ZoR7bcucWG2GEZxmZ`.
- API task definition: `repurposepro-production-api:1`.
- Worker task definition: `repurposepro-production-worker:1`.
- Shared storage: `fs-024dd357ca4d127e4`; access point: `fsap-0be7075998c29ae5c`.
- Queue: `repurposepro-production-queue`.
- Deployment branch: `codex/production-deploy`; initial infrastructure commit: `48ec2d6`.
- Application source deployed to the web and represented by the immutable container images is
  unchanged from the recorded staging release. Vercel's configured Git production branch remains
  `main`; this release used the CLI. Merge the deployment branch through the repository's normal
  review process before relying on future production Git builds.

The temporary root-profile cached credentials were removed with `aws logout` after completing
the explicitly approved IAM actions. Further routine work uses the restricted deployment role.

These are deployment/readiness checks. Signup/login with real sessions, email delivery, a sandbox
checkout/webhook credit grant and an actual media-processing job remain separate functional
acceptance work. The worker has no container health check; its running state and error-free startup
logs do not establish successful job execution.

## Release and rollback

1. Approve and attach the production permission package with an administrator identity.
2. Prepare isolated database credentials and verify migration state and an empty starting dataset.
3. Configure a sandbox Stripe webhook for the production API and production Vercel variables.
4. Deploy the separate DNS certificate and retain its validation CNAME.
5. Create and inspect CloudFormation change sets, then execute with rollback disabled so failures
   can be repaired without discarding retained dependencies.
6. Confirm stack completion, ECS rollout, API target health and dependency readiness.
7. Build Vercel with `--prod --skip-domain`, verify the built deployment, then promote it.
8. Assign production DNS and verify public web/API responses.

For a subsequent failed release, restore the web deployment ID and ECS task definitions recorded
above, and verify readiness again. Repair infrastructure separately while retaining stateful
dependencies. Do not delete or reset the database, filesystem, queue or secrets as a rollback step.
No schema or application behavior changes were required for this release.
