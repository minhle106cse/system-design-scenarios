# Running the Service Appointment Scheduler locally

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

## Try the booking flow

`npm run db:seed`'s console output prints the actual generated ids — substitute them below (or
copy from a fresh seed run). Full contract, error codes, and response shapes:
[docs/06_api_contracts.md](docs/06_api_contracts.md).

```bash
# 1. What's free tomorrow for an oil change?
curl "http://localhost:4002/api/v1/availability?dealershipId=<dealership-id>&serviceTypeId=<oil-change-id>&date=2026-08-17"

# 2. Book it — the server selects the bay and technician.
curl -X POST http://localhost:4002/api/v1/appointments \
  -H "Content-Type: application/json" \
  -H "X-Idempotency-Key: $(uuidgen)" \
  -d '{
    "customerId": "<customer-id>",
    "vehicleId": "<vehicle-id>",
    "dealershipId": "<dealership-id>",
    "serviceTypeId": "<oil-change-id>",
    "startAt": "2026-08-17T10:00:00Z"
  }'
# → 201, { id, status: "SCHEDULED", serviceBay: {...}, technician: {...} }

# 3. Read it back (use the id from step 2's response) — the persistent record, on demand.
curl http://localhost:4002/api/v1/appointments/<appointment-id>
# → 200, the same body step 2 returned

# 4. Cancel it.
curl -X POST http://localhost:4002/api/v1/appointments/<appointment-id>/cancel
# → 200, { status: "CANCELLED" } — calling this again is safe (idempotent no-op)

# 5. Read it back again — still there, now CANCELLED. Cancel is a state
#    transition, not a delete.
curl http://localhost:4002/api/v1/appointments/<appointment-id>
```

To see the concurrency guarantee itself rather than take it on faith: run the same `POST` from
step 2 twice in parallel with the same `startAt` and different idempotency keys. Exactly one
returns `201`; the other returns `409 APPOINTMENT_SLOT_CONFLICT`. The automated version of this
is `npm run test:integration` (below).

## Test

```bash
npm test          # all workspace tests (shared-kernel kernel specs + scheduler-api specs) — no Docker needed
npm run test:cov  # with coverage
npm run test:integration --workspace=@scheduler/api   # the concurrency proof — needs infra up + migrated (see above)
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
