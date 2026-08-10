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
| `docs/`, ADRs | New content in a ported scaffold shape | This scenario's business requirements, architecture, and the booking-concurrency decision |

## 3. What is new, not ported

- The scheduler domain itself: `Appointment`, `ServiceBay`, `Technician`, availability checking,
  the double-booking guard.
- `docs/adr/0002-booking-concurrency-control.md` — the one decision that was not delegated to the AI.
- `docs/00_overview.md`, `docs/12_ai_collaboration.md` — see the What/Why/How convention in
  .ai/plans/init-source.plan.md §5.1.
- `prisma/seed.ts` — Cortex ships no seed data; this repo needs one to be demoable from a clean clone.

## 4. Build, run, test

See [RUN.md](RUN.md) for the actual commands. In short: `npm install` → `npm run infra:up` →
`npm run db:migrate && npm run db:seed` → `npm run dev` → `npm test`.
