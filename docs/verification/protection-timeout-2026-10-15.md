# Protection decision latency fix — 2026-10-15

## Change

Intermittent Arcjet error decisions caused fail-closed HTTP 503 responses before authentication,
checkout and media mutations. Production logs confirmed unavailable decisions followed by allowed
retries for checkout, analysis, upload and other protected actions. Earlier logs intentionally
omitted provider reasons, so the precise cause of each historical error cannot be recovered.

Application commit `8247589` (staging cherry-pick `b47e259`) gives both Arcjet adapters an explicit
remote deadline. `ARCJET_TIMEOUT_MS` defaults to 5000 ms in all environments and accepts integers
from 1 to 10000. This replaces the SDK's 500 ms production default. LIVE rules, trusted ingress,
rate limits and fail-closed behavior remain enforced. Paid mutations are never automatically retried.

Protection logs retain request IDs and outcomes and now include elapsed `durationMs` and fixed
failure categories. Raw provider messages, request bodies, headers and credentials stay excluded.
No dependencies, migrations, queue behavior, worker image or application credentials changed.

## Validation

- Formatting and source lint passed. Workspace type checking and all application builds passed.
- The full unit run passed 859 tests. The final real-transport regression separately passed all
  three cases: a 750 ms ALLOW response, a 750 ms provider error, and an enforced 100 ms deadline.
- All 132 database/Redis integration tests passed in disposable local containers with the standard
  role-restoration wrapper. An initial concurrent run hit refund-test/fork timeouts; the isolated
  case and the complete rerun passed after compilation and browser setup finished.
- All eight browser tests passed, including signup, sandbox checkout and purchase replay,
  clip rendering/download, summary rendering, refund recovery, admin access and account settings.
- `pnpm ci:check` was attempted. Temporary operational scripts in ignored `tmp/` caused unrelated
  lint errors, and the configured development environment has no integration test URLs. The
  constituent checks were therefore completed with `eslint . --ignore-pattern tmp/` and disposable
  loopback-only integration services. No production or staging database was used for integration
  tests. The existing Next.js file-tracing warning remains.

## Staging, verified before production

- Web: `dpl_7WLWmLFJXxFai2k64mR3rXG38Msz`, READY at `https://staging.re-purpose.pro`.
- API task definition: `repurposepro-staging-api:2`; rollout COMPLETED with one healthy target.
- Readiness returned 200, with database and Redis up.
- A synthetic staging-only account signed up and signed in successfully. Signup/sign-in email
  sending is disabled in the existing auth configuration; these checks sent no email.
- Authenticated checkout, analysis and render checks passed actual Arcjet protection and reached
  their normal input validation (422, 422 and 400). Deliberately invalid inputs prevented purchases,
  credit charges and media jobs. Request IDs were matched to `allowed` events from the new API task.
- Successful cold guard durations included checkout 3552 ms, analysis 1822 ms and render 965 ms.
  These are complete guard timings, including initialization, rather than isolated remote RPC times.
- Staging verification was recorded at 14:59 Asia/Manila, before production deployment started.

## Production

- Web: `dpl_9AmRgSaNrkgENpPynrA194vBqtBB`, built as a staged production deployment, checked,
  then promoted to `https://re-purpose.pro`.
- API task definition: `repurposepro-production-api:2`; rollout COMPLETED with two healthy targets.
- Both environments use the same immutable API image:
  `402365884836.dkr.ecr.ap-southeast-1.amazonaws.com/repurposepro-staging-api@sha256:18d9516a72ef84ac5fa940effd131327ff0594cba6f2f2c8766488611c4ef4d6`.
- Live login/signup pages and session endpoint returned 200. A nonexistent-account login returned
  the normal 401 `INVALID_EMAIL_OR_PASSWORD`, and invalid signup input returned 400 validation.
  All four staged/live auth protection events were `allowed`; the live cold login guard took 1081 ms.
- API readiness returned 200 with database and Redis up; anonymous projects access remained 401.
- The two new API task streams contained zero error-level startup events. Web logs also contained
  the existing PostgreSQL SSL-mode deprecation warning; auth requests still reached normal validation.
- Production checks created no user, purchase, credit grant or media job. Actual paid processing
  against production providers was not part of this release's smoke checks.

## Release and rollback

Production cleanup could not deregister the replaced revision-1 API task definition. The existing
CloudFormation execution policy scopes `ecs:DeregisterTaskDefinition` to task-definition ARNs,
but the request was denied on resource `*`. The current [ECS authorization reference](https://docs.aws.amazon.com/service-authorization/latest/reference/list_ecs.html)
does not list resource-level support for this action. No permissions were expanded. The unused
old definition remains available; both revision-2 production tasks are healthy and their ECS
rollout is COMPLETED. The production stack reached UPDATE_COMPLETE with the warning
"Update successful. One or more resources could not be deleted." The old definition was retained
after three cleanup attempts, consistent with the [update monitoring guide](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-monitor-stack.html).

Both CloudFormation updates reused their existing templates and previous parameter values,
changing only `ApiImage`. Inspected change sets modified only `ApiTaskDefinition` and `ApiService`.
Source and image uploads used the existing verified Vercel project and AWS registry. Local secrets,
temporary files and the user's untracked Word document were excluded from uploads.

Previous production web deployment: `dpl_HigwDuEAYU7LHJ4nSZKXB5FoHrRH`. Previous staging web:
`dpl_2hESaFXrJrZ62CKcBAZ8txw1gDb1`. Both previous API task definitions were revision 1, using
image digest `sha256:690c5232cd9b31806e221fbb110fd4d9320c03984d54252984892a9d7cd2048f`.
If rollback is necessary, promote the previous web build and restore the previous `ApiImage`
through an inspected CloudFormation update; retain the database, queue, secrets and filesystem.

Deployment used CLI releases. The Vercel Git production branch remains `main`; normal repository
integration is still required before relying on future production Git builds.
