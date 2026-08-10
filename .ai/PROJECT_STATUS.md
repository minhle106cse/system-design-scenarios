# Project Status

> Curated by hand, After-Task. This is a WHAT-is-true-now summary, not a log —
> see `.ai/knowledge_builder.py`'s history handling for why detail belongs in
> `.ai/memory/*.jsonl` instead of here.

## Phase

**Init complete — base repository stood up from Cortex, per `.ai/plans/init-source.plan.md`, §10
verification fully green.**

Done:
- Monorepo tooling (`package.json`, `turbo.json`, `tsconfig.*`) — `npm install`, `turbo build`,
  `turbo typecheck`, `turbo lint`, `turbo test` all green
- `packages/shared-kernel` ported (CQRS bus, Unit-of-Work, error taxonomy, logger, resilience,
  tracing, schemas) with Cortex business content stripped — 52 tests green
- `apps/scheduler-api` skeleton — Nest/Fastify bootstrap, Prisma wiring, health/metrics/docs
  endpoints, idempotency interceptor + cleanup, global exception handling, trace-context
  middleware. Boots and serves `/health`, `/docs`, `/metrics`. 16 tests green.
- Database: `Appointment`/`ServiceBay`/`Technician`/`ServiceType`/`Dealership`/`Customer`/`Vehicle`
  schema + first migration, including the hand-added anti-double-booking exclusion constraints
  (verified live against Postgres — overlap rejected, back-to-back accepted, cancel frees the slot)
- Seed data (`prisma/seed.ts`) — one dealership, 3 bays, 3 technicians with differing
  qualifications, 4 service types, 1 customer + vehicle
- Docker: postgres + prometheus + grafana, reduced from Cortex's 18-service compose file — all
  three containers healthy, Grafana datasource + dashboard provisioned without crash-looping
- AI workflow: `.claude/` hooks (submodule logic removed, tested), `.ai/knowledge_builder.py`
  ported and regenerating the index correctly
- `directives/` (13 files) + `docs/` (10 files + 2 ADRs) written — ADR-0001 ported, ADR-0002 (the
  booking-concurrency decision) authored and verified live against Postgres
- Vietnamese translation pass complete (all `*.spec.ts` test descriptions translated) + global
  find-and-replace sweep audited — zero unexplained `distributed-social-platform`/domain-word hits
  in `apps/`, `packages/`, `docs/`, `directives/`
- **§10 verification, all green**: `npm install`, `docker compose up -d` (3/3 healthy), `db:migrate`
  (idempotent), `db:seed`, `turbo build/typecheck/lint/test` (0 errors, 18 non-blocking warnings,
  68 tests passing), `node scripts/sync.cjs` (exit 0, no `.gitmodules` error),
  `node .claude/hooks/turn-context.cjs` (valid JSON, exit 0), `python .ai/knowledge_builder.py`,
  app boot + `/health` (200, db ok) + `/docs` (200) + `/metrics` (200), Prometheus scrape target
  `scheduler-api` reporting `up`

Not started:
- The scheduler domain itself (booking command/query handlers, availability check,
  `modules/` is still empty) — the next phase, after this file's checklist

## Current focus

Init is done. Next: implement the scheduler domain (booking command, availability query,
cancellation) inside the ported skeleton, then finish the video/submission deliverables in
`.ai/plans/init-source.plan.md` §13.

## Live debts

- None blocking. `.ai/memory/*.jsonl`: `gotchas.jsonl` and `architecture.jsonl` hold real entries
  logged during this init (Prisma 7 schema break, two missing dependencies, the `fastify` version
  duplication, the `eslint-disable` line-targeting bug, the exclusion-constraint decision, the ADR
  numbering decision); `errors.jsonl`/`conventions.jsonl` remain empty — nothing distinct to log
  there yet.
