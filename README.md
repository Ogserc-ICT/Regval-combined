# OGSERC Registry & Evaluation

Staff-only web app for the Ogun State Electricity Regulatory Commission: operator registration and evaluation (Order No. OGSERC/ORD/2026/001) and the Registry, in one app with one database and one OGSERC/ACK series.

- Build brief: [docs/COMBINED_BUILD.md](docs/COMBINED_BUILD.md)
- Rules: [docs/SPEC.md](docs/SPEC.md) · Plan: [docs/PLAN.md](docs/PLAN.md) · Open questions: [docs/QUESTIONS.md](docs/QUESTIONS.md)
- Deploying: [docs/DEPLOY.md](docs/DEPLOY.md)

## Run it locally

Needs Node 22+, pnpm 10 and Docker.

```sh
pnpm install
cp .env.example .env.local        # then set AUTH_SECRET and the BOOTSTRAP_ADMIN_* values
pnpm db:up                        # PostgreSQL on localhost:5433 (dev + test databases)
pnpm db:migrate
pnpm db:seed                      # holidays, seeded staff (inactive), first admin
pnpm dev                          # http://localhost:3000
```

## Checks

```sh
pnpm typecheck
pnpm lint
pnpm test:unit
pnpm test:integration             # wipes and migrates TEST_DATABASE_URL
pnpm build
```

CI runs all of them on every push and pull request (`.github/workflows/ci.yml`).

## Layout

```
src/domain/        pure business rules (dates, working days, deemed receipt, validators, settings, numbering, roles)
src/server/        database, services, auth, numbering service, audit writer, Lagos clock
src/app/           pages, server actions, route handlers
src/components/    shell (sidebar) and UI components
seed/              idempotent seed and its data files
tests/integration/ tests against a real PostgreSQL database
```

Database changes: edit `src/server/db/schema/*`, run `pnpm db:generate`, commit the SQL in `src/server/db/migrations/`.
