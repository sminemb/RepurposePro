# RepurposePro

RepurposePro turns long podcast and talking-head videos into short vertical clips and condensed
summary videos. This repository currently contains the VS0 bootable platform foundation.

## Prerequisites

- Node.js 22.18.x
- pnpm 11.10.x
- Docker Desktop with Docker Compose
- Stripe CLI authenticated to the test account when testing local billing

PostgreSQL and Redis run in Docker for local development, so native `psql` and `redis-cli`
installations are not required.

## First-time setup

```powershell
Copy-Item .env.example .env
Copy-Item .env.database.example .env.database
pnpm install --frozen-lockfile
pnpm infra:up
pnpm db:migrate
pnpm dev
```

Equivalent POSIX environment setup:

```bash
cp .env.example .env
cp .env.database.example .env.database
```

The combined development command starts all three TypeScript applications:

- Web: <http://localhost:3000>
- API liveness: <http://localhost:4000/api/v1/health/live>
- API readiness: <http://localhost:4000/api/v1/health/ready>
- Worker: non-HTTP process; readiness is emitted as the structured `worker.ready` log event

The API and worker fail startup when configuration is invalid or their required PostgreSQL and
Redis connections cannot be established.

## Common commands

| Command                    | Purpose                                                                 |
| -------------------------- | ----------------------------------------------------------------------- |
| `pnpm dev`                 | Build shared packages and start web, API, and worker in watch mode      |
| `pnpm dev:web`             | Start only the web app                                                  |
| `pnpm dev:api`             | Start only the API                                                      |
| `pnpm dev:worker`          | Start only the worker                                                   |
| `pnpm infra:up`            | Start PostgreSQL and Redis and wait for health checks                   |
| `pnpm infra:status`        | Show local infrastructure status                                        |
| `pnpm infra:check`         | Query PostgreSQL and ping Redis from Node.js                            |
| `pnpm infra:down`          | Stop containers while preserving named data volumes                     |
| `pnpm stripe:listen`       | Forward paid and expired Stripe Checkout events to the local API        |
| `pnpm db:generate`         | Generate a Drizzle migration from the current schema                    |
| `pnpm db:migrate`          | Apply pending Drizzle migrations                                        |
| `pnpm lint`                | Run the root ESLint flat configuration                                  |
| `pnpm typecheck`           | Typecheck shared packages and all applications                          |
| `pnpm test`                | Run Vitest unit tests                                                   |
| `pnpm test:db-integration` | Run required billing integrity tests on disposable PostgreSQL databases |
| `pnpm build`               | Build all workspace projects in dependency order                        |
| `pnpm ci:check`            | Run formatting, lint, typecheck, tests, and builds                      |

## Environment configuration

Runtime processes load only `.env`, created from `.env.example`. Compose, migration, role
provisioning, and disposable PostgreSQL integration tests use `.env.database`, created from
`.env.database.example`. Never copy administrative database credentials into `.env`.

Real secrets and both local environment files are ignored by Git.

The public web configuration contains only `APP_URL`, `APP_ENV`, `NODE_ENV`, and
`NEXT_PUBLIC_API_URL`. Database and Redis connection values are loaded only by server processes.

## Local Stripe billing

Local Checkout fulfillment requires both the API and Stripe CLI listener to stay running. Start the
application in one terminal:

```powershell
pnpm dev
```

After API readiness returns HTTP 200, start webhook forwarding in another terminal:

```powershell
pnpm stripe:listen
```

The listener prints a `whsec_...` signing secret. Store it as `STRIPE_WEBHOOK_SECRET` in ignored
`.env`, then restart the API whenever this value changes. Do not commit or paste the secret into
logs, task records, or source files.

Stripe Checkout redirects before webhook processing is guaranteed to finish. The Billing page may
briefly report that confirmation is pending. Refresh after the listener reports an HTTP 200
delivery.

If a completed test Checkout still has no credits:

1. Confirm `http://localhost:4000/api/v1/health/ready` returns HTTP 200.
2. Confirm `pnpm stripe:listen` is running and its signing secret matches `.env`.
3. Find the original `checkout.session.completed` event in Stripe Workbench.
4. Resend that event without creating a new Checkout:

   ```powershell
   stripe events resend evt_replace_me --confirm
   ```

5. Refresh Billing and verify one purchase appears in the immutable credit ledger.

Never repair a purchase by inserting a payment or credit-ledger row manually. Event resend uses the
same signed, authoritative, idempotent fulfillment path as the original delivery, so replaying the
same event cannot grant credits twice.

## Database migrations

The committed `0000_vs0_baseline` migration is intentionally a no-op. It initializes Drizzle's
migration history without creating product tables. Each future vertical slice introduces only the
tables required for its user outcome.

Running `pnpm db:migrate` more than once is safe; already-applied migrations are skipped.

## Troubleshooting

- If startup reports invalid configuration, compare `.env` with `.env.example`. Errors list only
  invalid variable names and never include secret values.
- If readiness returns HTTP 503, run `pnpm infra:status` and then `pnpm infra:check`.
- If paid test credits remain pending, keep the API and `pnpm stripe:listen` running, verify their
  signing secrets match, then resend the original completed event as described above.
- If ports 5432 or 6379 are already occupied, stop the conflicting local service or override the
  Compose port mapping before starting the stack.
- If a native dependency was installed without its approved build, rerun `pnpm install`; the
  repository explicitly allows the required NestJS, esbuild, and sharp builds.

## Shutdown

Stop the application processes with `Ctrl+C`, then stop local infrastructure:

```powershell
pnpm infra:down
```

Named PostgreSQL and Redis volumes remain intact. Removing those volumes is intentionally not part
of the standard shutdown command because it deletes local data.
