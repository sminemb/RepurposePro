# Repository Guidelines

## Project Structure & Module Organization

RepurposePro is a pnpm TypeScript monorepo:

Read the relevant material in [`docs/`](docs/) before making changes, especially architectural decisions in `docs/adr`.

- `apps/api` contains the NestJS HTTP API, organized by domain under `src/modules`.
- `apps/web` contains the Next.js UI; keep routes in `app`, reusable UI in `components`, and domain behavior in `features`.
- `apps/worker` runs background processing; `apps/stripe-listener` forwards local Stripe events.
- `packages/config`, `packages/db`, and `packages/shared` provide workspace libraries. Database schema and Drizzle migrations live in `packages/db`.
- `scripts` holds operational checks and local tooling; `infra` contains Docker/PostgreSQL setup; `docs/adr` stores architectural decisions.
- `storage` is local runtime data and must not be treated as source or committed.

## Build, Test, and Development Commands

Use Node.js 22.18.x and pnpm 11.10.x. Start with `pnpm install --frozen-lockfile`, copy both example env files, then run `pnpm infra:up`, `pnpm db:migrate`, and `pnpm dev`.

- `pnpm dev:apps` starts web, API, and worker without Stripe forwarding; `pnpm dev:web`, `pnpm dev:api`, and `pnpm dev:worker` run one app.
- `pnpm format:check`, `pnpm lint`, and `pnpm typecheck` validate formatting, ESLint rules, and TypeScript.
- `pnpm test` runs Vitest; `pnpm test:db-integration` runs PostgreSQL integration tests with cleanup.
- `pnpm build` builds workspace projects; `pnpm ci:check` runs the full local quality gate.

## Coding Style & Naming Conventions

Write TypeScript formatted by Prettier: 2-space indentation, semicolons, double quotes, trailing commas, and a 100-column width. Use type-only imports where ESLint requires them. Follow nearby naming: PascalCase for classes/components/types, camelCase for functions and variables, and descriptive domain filenames such as `billing.service.ts` and `checkout.controller.ts`.

## Testing Guidelines

Tests use Vitest and are colocated with implementation as `*.spec.ts` (for example, `apps/api/src/modules/billing/billing.service.spec.ts`). Add or update focused tests for changed behavior; no repository-wide coverage threshold is configured. Start Docker services before database or Redis integration tests.

## Commit & Pull Request Guidelines

Commits follow Conventional Commit-style prefixes and optional scopes, such as `feat(worker): ...`, `fix(tooling): ...`, and `chore: ...`. Pull requests should explain the behavior change, list validation commands, call out migrations or environment changes, and include screenshots for UI changes. Run `pnpm ci:check` before requesting review.

## Security & Configuration Tips

Keep secrets in ignored `.env` and `.env.database` files created from the examples. Do not commit credentials, Stripe webhook secrets, generated `dist`/`.next` output, or local storage data. Use `pnpm test:db-integration` rather than manually changing database test-role credentials.
