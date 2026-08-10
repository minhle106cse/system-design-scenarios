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
npm test        # turbo test — all workspaces
```

No CI pipeline config is included in this submission (out of scope for the assessment's
deliverables) — but every gate above is what a CI pipeline would run, and all four are green as of
init (`.ai/PROJECT_STATUS.md`).

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
