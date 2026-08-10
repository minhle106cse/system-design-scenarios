# Running Keyloop Service Scheduler locally

Single-service Turborepo monorepo: one NestJS app (`apps/scheduler-api`), one Postgres database,
Prometheus + Grafana for observability. No gateway, no message broker, no submodules — clone once,
run once. See [docs/03_system_architecture_diagrams.md § Deferred scope](docs/03_system_architecture_diagrams.md)
for what was deliberately left out and why.

## Prerequisites

- Node 22+, npm 11+, Docker Desktop
- A `.env` at the repo root — copy `.env.example`, defaults work as-is for local Docker
- Python 3.10+ — only needed for `.ai/knowledge_builder.py` (runs automatically via the Stop hook
  if you're using this repo with Claude Code; skip it otherwise)

## Start

```bash
# 1. Install workspace dependencies
npm install

# 2. Infra: postgres · prometheus · grafana
npm run infra:up

# 3. First time only — apply migrations (creates the anti-double-booking constraint,
#    see docs/adr/0002-booking-concurrency-control.md) and seed demo data
npm run db:migrate
npm run db:seed

# 4. App, with hot-reload
npm run dev
```

The app listens on **http://localhost:4002**. `GET /health` for liveness, `GET /docs` for the
OpenAPI/Swagger UI (dev only), `GET /metrics` for Prometheus scrape.

## Quick smoke test

```bash
curl http://localhost:4002/health
curl http://localhost:4002/docs-json   # OpenAPI spec, also usable to generate a client
```

Booking endpoints and their cURL examples are documented in
[docs/06_api_contracts.md](docs/06_api_contracts.md) once the scheduler domain is implemented —
this file (`RUN.md`) only covers the skeleton produced at init.

## Test

```bash
npm test          # all workspace tests (shared-kernel kernel specs + scheduler-api specs)
npm run test:cov  # with coverage
```

## Stop

```bash
# Ctrl+C the dev process, then:
npm run infra:down
```

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| `npx turbo typecheck` fails on `idempotency.interceptor.ts` | `IdempotencyRecord` missing from `schema.prisma` — see `apps/scheduler-api/prisma/schema.prisma` and .ai/plans/init-source.plan.md §8.1 |
| `db:migrate` fails on the `Appointment` table | Needs the `btree_gist` extension for the exclusion constraint — the first migration enables it; see `docs/adr/0002-booking-concurrency-control.md` |
| `node scripts/sync.cjs` throws about `.gitmodules` | This repo has none by design — see .ai/plans/init-source.plan.md §6.3 |
