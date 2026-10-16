# Staging deployment

This deployment uses AWS account `402365884836` in `ap-southeast-1`, Neon in Singapore,
and the existing Vercel project `sminembs-projects/repurposepro`.

## Deployment status

Deployed on 2026-10-14:

- `RepurposePro-Staging-Runtime` reached `UPDATE_COMPLETE`.
- Both ECS services completed deployment with one desired task, one running task, and no
  pending tasks. The API container and load-balancer target are healthy.
- The API readiness URL returned HTTP 200 with Neon and Redis both reported as `up`.
- Vercel Preview deployment `dpl_89i6nEhq4631xrbZv6M4J4yD79et` reached `READY`, and the
  staging web URL returned HTTP 200 using the owner's existing Vercel authentication.
- Neon has 48 applied migrations and no users, projects, uploads, processing jobs, or payments.

These checks cover deployment readiness. Signup, email delivery, sandbox checkout, and
media processing still need separate functional checks.

## Addresses

| Service | Address |
| --- | --- |
| Web | `https://staging.re-purpose.pro` |
| API | `https://api-staging.re-purpose.pro/api/v1` |
| API readiness | `https://api-staging.re-purpose.pro/api/v1/health/ready` |
| Stripe sandbox webhook | `https://api-staging.re-purpose.pro/api/v1/billing/webhook` |

The web domain is assigned to the Preview environment for `codex/staging-deploy`.
Its GoDaddy CNAME target is `f1551fc282f5e1af.vercel-dns-017.com`.

The API CNAME target is `repurposepro-staging-api-1744023284.ap-southeast-1.elb.amazonaws.com`,
also available as the `ApiLoadBalancerDns` output of the runtime stack. Keep the ACM
validation CNAME so AWS can renew the API certificate.

## Database

Neon project: `late-lake-42220882`. Branch: `br-winter-sky-b3nd2gt7`. Database: `repurposepro`.
The staging database has 48 applied migrations. Owner and bootstrap connections are for
administration only. Application services use the separate restricted runtime, checkout,
webhook, processing, and admin roles.

Provision roles before applying migrations to a fresh database. Run administrative operations
with the direct endpoint; use the pooled runtime endpoint for the web app. All runtime
connections enable TLS. The API's admin URL must have no query parameters.

## AWS infrastructure

`infra/staging-runtime.cloudformation.json` defines:

- One API task and one CPU worker task in the existing staging ECS cluster.
- An HTTPS application load balancer, with HTTP redirected to HTTPS.
- Two private subnets for shared storage and the queue, with a route table containing no
  internet gateway route.
- Encrypted EFS shared through a private access point owned by UID/GID 1000.
- One Redis-compatible Valkey node with TLS, password authentication, daily backup and
  `noeviction`. This staging configuration has no automatic failover.
- Four security groups. API traffic comes from the load balancer; cache and NFS access come
  from the application task group. Tasks use public IPs for outbound provider access.
- CloudWatch logs retained for 14 days.

The single-endpoint queue configuration matches the existing `ioredis` clients. Switching to
ElastiCache Serverless requires cluster clients and compatible queue key placement.

The runtime stack takes private values through masked parameters and injects application
secrets through Secrets Manager references. No credentials belong in templates or task
environment properties. The web and API must use the same `BETTER_AUTH_SECRET`.

Existing application secret names are under `repurposepro/staging/`. The configuration
bootstrap retained nine secrets after its certificate resource failed. Use their existing
ARNs rather than attempting to recreate those names. The separate
`RepurposePro-Staging-ApiCertificate` stack successfully owns the issued API certificate.

The runtime stack retains the queue, filesystem, and secrets on deletion or replacement.
Deploy with resource preservation on failure so an unsuccessful attempt can be repaired
without deleting stateful dependencies.

The runtime policy separates EC2 creation authorization on the existing VPC from tag
requirements on new network resources. ELB creation also needs permission to add the
initial tags. The target-group provider creates the exact staging group before applying
tags. Generated cache parameter-group names use the `repurp-cache-` prefix; creation
requires staging request tags and subsequent changes require staging resource tags.

The three inline policies on the CloudFormation execution role share IAM's 10,240-character
limit. The bootstrap policy omits the superseded certificate request statement, which is
covered by the separately approved certificate policy. Creation of the same 11 secret names
is consolidated in the runtime policy; the bootstrap policy now supplies secret and
certificate metadata/tagging permissions.

## Images and source

The staging branch includes the Neon provisioning fix and container build files.

- API: `repurposepro-staging-api`, digest
  `sha256:690c5232cd9b31806e221fbb110fd4d9320c03984d54252984892a9d7cd2048f`.
- Worker: `repurposepro-staging-worker`, digest
  `sha256:1fafd3aa0b740994208b9a7806549f4109d9cc9f2805ad120e4b558f01594201`.

The API image includes FFprobe for uploaded video inspection. Both tasks mount the same
filesystem. Worker model downloads use a cache outside the uploaded-file directory.

Vercel builds the shared packages before the Next.js app:

```text
cd ../.. && pnpm build:packages && pnpm --filter @repurposepro/web build
```

Private local configuration is stored in ignored files. `.vercelignore` excludes environment
files, temporary operational files, generated output, and local media from uploads.

## Operational checks

The template was checked with isolated cfn-lint 1.57.2 and cfn-guard 3.2.1 tools.
The schema check has no errors; warnings cover fixed staging availability zones and the
masked cache authentication parameter. Applicable AWS registry security rules pass.
The HTTP redirect listener and external ACM parameter have documented rule exceptions.
The registry's cache TLS rule only selects Redis, so Valkey's required transit encryption
is checked directly in the template. Both Fargate containers run as UID/GID 1000.

CloudFormation created an available change set for the 31-resource stack. The deployment
role currently lacks `cloudformation:DescribeEvents`, so detailed AWS validation findings
could not be retrieved; do not treat that denied read as a successful validation check.

After deployment, confirm both ECS services reach their desired running counts and the load
balancer reports healthy API targets. The API readiness route checks its dependencies.
The web Preview remains protected by Vercel Authentication.

Account signup, email delivery, sandbox checkout, and a real media-processing job require
separate functional checks. Do not use live Stripe credentials for this staging deployment.
