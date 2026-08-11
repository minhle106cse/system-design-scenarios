# SETUP — how this repo was built

This repo's monorepo tooling, AI-agent workflow, and shared-kernel were ported from **Cortex**
(`distributed-social-platform`), a 5-service platform, deliberately **stripped down to the single
bounded problem this scenario asks for** — no submodules, no message broker, no second service.
The full reasoning for every inclusion and every deferral lives in
[`.ai/plans/init-source.plan.md`](.ai/plans/init-source.plan.md) (this repo's init plan, kept as
the primary evidence for the AI Collaboration Narrative — see
[docs/12_ai_collaboration.md](docs/12_ai_collaboration.md)).

This document is the short version: what is reused, what is new, and why.

## 1. Prerequisites

| Tool | Version | Used for |
|---|---|---|
| Node.js | ≥ 22 | Turborepo, the app, hooks (`sync.cjs`, `turn-context.cjs`) |
| npm | ≥ 11 | Workspaces (`apps/*`, `packages/*`) |
| Docker + Compose | recent | Postgres, Prometheus, Grafana |
| Python | ≥ 3.10 | `.ai/knowledge_builder.py` — invoked automatically by the Stop hook |
| Git | — | Single repo, no submodules |

## 2. What came from Cortex, and how

| Path | Origin | Notes |
|---|---|---|
| `package.json`, `turbo.json`, `tsconfig.*` | Ported, edited | `@distributed-social-platform/*` → `@scheduler/*`; task graph unchanged (domain-free) |
| `packages/shared-kernel/` | Ported, business stripped | CQRS bus, Unit-of-Work (TxScope), error taxonomy, structured logging, tracing. See .ai/plans/init-source.plan.md §3 for the file-by-file decision. |
| `apps/scheduler-api/` | Shape ported from `apps/core-api`, contents new | Hexagonal layout, NestJS/Fastify bootstrap, Prisma wiring — the scheduler domain itself is new work, not ported |
| `.claude/`, `.ai/`, `scripts/sync.cjs`, `AGENTS.md` | Ported, submodule logic removed | The AI-agent workflow — routing hook, knowledge index builder, After-Task discipline. See .ai/plans/init-source.plan.md §6. |
| `directives/` | Subset ported, examples swapped | Coding standards (CQRS pattern, domain modelling, testing, idempotency, observability) — see .ai/plans/init-source.plan.md §4 |
| `docker-compose.yml`, `docker-init/` | Reduced | Postgres + Prometheus + Grafana only. See .ai/plans/init-source.plan.md §7. |
| `docs/`, ADRs | New content in a ported scaffold shape | This scenario's business requirements, architecture, and the two design decisions kept by the owner (ADR-0002 booking concurrency, ADR-0003 availability & selection policy) |

## 3. What is new, not ported

- **The scheduler domain** (`src/modules/booking/`): the `Appointment` entity, business-hours
  arithmetic, deterministic resource selection, three command/query handlers, seven repositories,
  two controllers.
- **Two ADRs decided by the project owner, not delegated**:
  `0002-booking-concurrency-control.md` (the double-booking guarantee) and
  `0003-availability-and-selection-policy.md` (the availability algorithm, the selection policy, and
  the no-auto-retry rule for a slot conflict).
- **Both hand-written database constraints**: the two `EXCLUDE USING gist` constraints in the first
  migration, and `service_types_duration_positive` in the second — neither expressible in
  `schema.prisma`.
- **`infrastructure/observability/booking.metrics.ts`** and the Grafana panels built on it.
- **The integration test harness** (`jest.integration.config.js` + `*.int-spec.ts`) — deliberately a
  separate Jest project so `npm test` stays Docker-free.
- **OpenAPI request/response schemas** generated from the Zod schemas via `z.toJSONSchema()`, with
  compile-time assertions that the published spec and the handler DTOs cannot drift apart.
- `docs/00_overview.md`, `docs/12_ai_collaboration.md` — see the What/Why/How convention in
  .ai/plans/init-source.plan.md §5.1.
- `prisma/seed.ts` — Cortex ships no seed data; this repo needs one to be demoable from a clean clone.
- `.ai/plans/booking-domain.plan.md` and `.ai/plans/hardening.plan.md` — the plans for the two phases
  after init, committed as evidence per `AGENTS.md`'s Citation Protocol.

## 4. Build, run, test

See [RUN.md](RUN.md) for the actual commands. In short: `npm install` → `npm run infra:up` →
`npm run db:migrate && npm run db:seed` → `npm run dev` → `npm test`.

One command is easy to miss: **`npm run test:integration --workspace=@scheduler/api`**. It needs
Postgres up and migrated, and it is the only test that proves the flagship guarantee — two
concurrent bookings, exactly one winner, against the real exclusion constraint.
