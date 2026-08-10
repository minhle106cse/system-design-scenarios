# DevOps & Infrastructure

## Local stack

```
docker-compose.yml → postgres (15433 host port), prometheus (9090), grafana (3000)
```

Started with `npm run infra:up` (plain `docker compose up -d` — no profile gate, T2 observability
is included by default, see `.ai/plans/init-source.plan.md` §1). Full instructions: `RUN.md`.

`apps/scheduler-api` itself runs **on the host**, not in a container, for hot-reload during
development (`npm run dev`) — Prometheus reaches it via `host.docker.internal:4002`.

## Why port 15433, not Postgres's default 5432 or Cortex's 15432

`5432` is commonly occupied by a host-installed Postgres. `15432` (Cortex's own convention) was
found occupied on this machine by Cortex's own running dev stack during init — verified, not
assumed (`.ai/memory/gotchas.jsonl`). `15433` avoids both.

## Database lifecycle

```bash
npm run db:migrate    # applies prisma/migrations, including the hand-added exclusion constraints
npm run db:seed        # dealership, 3 bays, 3 technicians (differing qualifications), 4 service types, 1 customer+vehicle
```

Migrations are committed (`prisma/migrations/`), not `db push` — see `directives/database_standard.md`
§5 and `.ai/plans/init-source.plan.md` §8.2 for why: a reviewer can read the schema's history, and the exclusion
constraints (ADR-0002) need to be reviewable, versioned SQL, not implicit state.

## Business hours configuration

Four env keys the booking domain reads at request time — no migration, no table (ADR-0003 §2.3):

| Key | Default | Meaning |
|---|---|---|
| `BUSINESS_HOURS_START` | `08:00` | first bookable local time |
| `BUSINESS_HOURS_END` | `18:00` | latest local time a service may **end** |
| `BUSINESS_TIMEZONE` | `UTC` | IANA zone the two times above are expressed in |
| `SLOT_GRANULARITY_MINUTES` | `30` | step between `GET /availability` candidate starts |
| `BUSINESS_DAYS` | `1,2,3,4,5` | ISO weekdays the dealership opens (1 = Mon … 7 = Sun) |
| `BUSINESS_CLOSED_DATES` | *(empty)* | one-off closures as `YYYY-MM-DD`, comma-separated |

Validated at boot (`env.validation.ts`): `BUSINESS_HOURS_START < BUSINESS_HOURS_END`,
`BUSINESS_TIMEZONE` must be a zone `Intl.DateTimeFormat` accepts, `BUSINESS_DAYS` must be a non-empty
set of `1..7`, and every `BUSINESS_CLOSED_DATES` entry must be `YYYY-MM-DD`. An app that boots with a
bad timezone fails fast, rather than throwing a `RangeError` from inside the first availability
request.

## Database constraints that are not in `schema.prisma`

Two migrations carry hand-written SQL Prisma's DSL cannot express. Both are load-bearing, and a
regenerated migration that dropped either would remove a guarantee without any test failing:

| Migration | Constraint | Guards |
|---|---|---|
| `20260810051339_init` | `appointments_service_bay_no_overlap`, `appointments_technician_no_overlap` (`EXCLUDE USING gist`) | The core no-double-booking guarantee (ADR-0002) |
| `20260810150000_service_type_duration_positive` | `CHECK (duration_minutes > 0)` | A zero duration makes the ranges above **empty**, silently disabling both (see `docs/04_database_schema.md`) |

## Observability stack

See `directives/observability_monitoring.md` for the full topology, metric conventions, and the
Grafana-provisioning gotcha (changing a datasource `uid` after first provisioning crash-loops the
container — already worked around in `docker-init/grafana/provisioning/datasources/datasource.yml`).

Quick reference:

| Component | URL | Purpose |
|---|---|---|
| Prometheus | `http://localhost:9090` | Scrapes `scheduler-api`'s `/metrics` on the host |
| Grafana | `http://localhost:3000` | `scheduler-overview` dashboard (service up, CPU, heap, event-loop lag) |

## CI / build gates

```bash
npm run check   # = turbo run typecheck lint format:check
npm run build   # turbo build — shared-kernel (tsc -b) then scheduler-api (nest build)
npm test        # turbo test — all workspaces, no Docker required
npm run test:integration --workspace=@scheduler/api   # real-Postgres concurrency proof — needs infra up + migrated
```

No CI pipeline config is included in this scenario (out of scope for its deliverables) — but
every gate above is what a CI pipeline would run. `npm test` deliberately stays infrastructure-free
(see `docs/08_testing_and_qa_strategy.md`); `test:integration` is the one command that needs
`docker compose up -d` and `db:migrate` first.

## Fresh-clone path (what a reviewer actually runs)

```bash
git clone <repo>
cd keyloop-service-scheduler
cp .env.example .env
npm install
npm run infra:up
npm run db:migrate
npm run db:seed
npm run dev
```

Then `curl http://localhost:4002/health` and `http://localhost:4002/docs`.

## What's deliberately not here

No Dockerfile for `apps/scheduler-api` itself (it runs on the host, not containerized, matching
Cortex's own dev-mode convention — see `directives/logging_standard.md`'s note on Cortex's
production log-shipping blueprint, not ported here since it depends on a containerized app that
doesn't exist). No CD/deploy pipeline — out of scope for a technical assessment submission whose
deliverable is a reviewable repository, not a running production service.
