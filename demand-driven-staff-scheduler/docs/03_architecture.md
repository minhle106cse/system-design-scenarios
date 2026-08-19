# Architecture

## Shape

> **Superseded shape, kept for context:** this section originally described one Next.js app with
> `apps/web/src/server/` doing persistence and business logic. The user rejected that collapse —
> this collection's system-design principle is a real backend service, `apps/web` is a UI on top of
> it, not a replacement for one (`.ai/plans/backend-architecture-reversal.plan.md`, confirmed by the
> user directly, `.ai/PROJECT_STATUS.md`'s "Decisions taken by the user, not by default"). The shape
> below is what actually shipped.

```
apps/
├── scheduler-api/               NestJS + Fastify — CQRS + Hexagonal, owns Postgres
│   ├── prisma/                  schema.prisma (postgresql) · migrations/ · seed.ts
│   └── src/
│       ├── bootstrap/           fastify.ts (CORS/helmet/compress/multipart) · server.ts · swagger.ts
│       ├── config/              Zod-validated env
│       ├── infrastructure/      cqrs/ · database/prisma/ · http/(filters,interceptors,pipes)
│       └── modules/scheduling/  domain/ · application/(commands,queries,shared) · infrastructure/ · presentation/
└── web/                         Next.js 15, App Router — UI ONLY, no database, no business logic
    └── src/
        ├── app/                 screens (docs/05) — Server Components by default
        ├── components/          ~6 hand-rolled primitives (directives/frontend_standard.md)
        └── lib/api-client.ts    fetch wrapper against apps/scheduler-api, the ONLY thing that calls it

packages/
├── scheduling-core/   ⭐ zero-runtime-dependency algorithm — docs/00 § the one structural decision
└── shared-kernel/     CQRS bus, Unit-of-Work, errors, logger, resilience — ported, generic infra

docker-compose.yml     postgres only (Prometheus/Grafana deferred, directives/resilience_patterns.md)
turbo.json             build/test/lint/dev orchestration across the workspace
```

Two processes, one Postgres, no message broker, no cache. `npm run dev` (root, via Turborepo)
starts both apps; `npm run infra:up` (`docker-compose up -d`) starts Postgres.
`docs/09_running_it.md` has the full sequence.

**Why `scheduling` has no domain-service layer the way `../service-appointment-scheduler`'s
`booking` module does:** this domain's business logic already lives in the framework-free
`@scheduler/scheduling-core` package (ADR-0004) — command/query handlers call into it directly
(`generateRoster`, `validateRoster`, `summarise`) rather than re-deriving rules NestJS-side. The
hexagonal domain layer's job here is orchestration (repository ↔ scheduling-core), not business
logic — see `scheduling.module.ts`'s docstring for the full argument.

## The auto-scheduler pipeline (plan §7)

```
DemandGrid ─▶ (1) demand model ─▶ required[day][hour]
                                        │
                                        ▼
                  (2) shift requirements ─▶ floor[day][shift], target[day][shift]
                                        │
                                        ▼
            (3) assigner ◀── FeasibilityGate ──▶ (4) rebalancer
                                        │
                                        ▼
                           Roster + (5) Diagnostics
```

`FeasibilityGate` (stage 3's chokepoint) is the only way an assignment can enter a `RosterState` —
see `adr/0001-constraint-enforcement-strategy.md`. Stages 1–2 turn demand into a headcount per
(day, shift); stages 3–4 assign and then rebalance for fairness; stage 5 never throws and never
silently drops a seat. This whole pipeline lives in `packages/scheduling-core`, unchanged by the
backend-architecture reversal (ADR-0004) — `apps/scheduler-api`'s handlers only call into it.

**Two callers, one set of rules — the gate is replayed, not re-implemented, for manual edits.**
`AutoScheduleHandler` calls `generateRoster` (the pipeline above); `AddAssignmentHandler` (manual
roster editing) calls `validateRoster` instead — the SAME `FeasibilityGate`, replayed against the
existing roster plus one candidate assignment. `GetCoverageHandler` (the coverage view) does the
same replay again, read-only, to recompute `Diagnostics` live from whatever is currently
persisted — never from a stored snapshot, so it stays correct after a manual edit
(`docs/04_data_model.md`'s corrected note). One implementation of the rules, three callers.

## § Deferred scope

Every intentional omission, with its trigger — not "not done", but "not yet, and here's what would
change that". Reconciled against what actually shipped (Phase D/E, `.ai/PROJECT_STATUS.md`):

| Not built | Why not | Trigger |
|---|---|---|
| DB-level constraints on the roster | Covers at most one of three hard constraints, at the cost of a denormalised column. The gate covers all three from one implementation. | Writes arriving from a path that bypasses the application (there is none today — `Assignment` is only ever written by `PrismaAssignmentRepository`) |
| Auth / multi-user / deployment | Named out of scope by the brief | — |
| Idempotency store | Not needed by construction: auto-schedule is a full replace, CSV import is an upsert (`directives/resilience_patterns.md` §1) | An append-only mutation appears |
| Prometheus/Grafana | `/metrics` already exposes `prom-client`'s default registry (Phase C) — scraping infra itself is deferred | Explicit request, or a debugging need a log line can't answer |
| An LP/CP-SAT solver | `adr/0002-auto-schedule-algorithm.md` §5 | Hard constraints multiply: skills, availability, statutory rest, multi-site |
| ~~Per-staff availability (H4)~~ | Brief stretch goal 3. `FeasibilityGate` already had the slot (H4, reused before this for "unknown staff/shift reference" — split, D4). | Time remaining after core build-out — **superseded, built**, `stretch-goals-availability-and-roles.plan.md` §1 (2026-08-18); kept here struck through per the audit-trail convention rather than deleted |
| ~~Roles/skills~~ | Brief stretch goal 4. Answered as a seat-filling responsibility (`rolePass`), never a sixth gate constraint — `FeasibilityGate` is unchanged. | **Superseded, built**, `stretch-goals-availability-and-roles.plan.md` §2 + **ADR-0006** (2026-08-18); struck through per the audit-trail convention rather than deleted |
| Manual roster editing beyond add/remove one assignment (e.g. drag-and-drop reorder) | Brief's stretch goal only asked for add/remove, gated by `validateRoster` — built (Phase D) | A richer UI interaction once Phase 3 screens exist |
| ~~`apps/web`'s UI screens (staff/demand/shift/roster/summary/coverage)~~ | `apps/scheduler-api` (the harder half, and what's graded as "the heart of the exercise") was proven first — same "prove the core, then widen" discipline as the original plan's phase ordering. | **Superseded, built** — all seven screens shipped in Phase 3 (`.ai/PROJECT_STATUS.md`), which also closed four backend gaps they exposed (`GET /schedules`, `PATCH /schedules/:id`, `GET .../suggested-n`). The brief's §5 makes a UI required, not optional, so this row's original "genuinely optional" framing was wrong even before it was built |

**No longer deferred — built in the backend-architecture reversal, kept here for the audit trail:**
a database server (now Postgres + Docker), a CQRS/command bus (`packages/shared-kernel`, ported).
The reversal's own reasoning (`.ai/PROJECT_STATUS.md`'s "Decisions taken by the user, not by
default") is why these rows moved out of this table rather than being silently deleted from it.

Full reasoning for what's still deferred: `../.ai/plans/init-source.plan.md` §1 (original) and
`.ai/plans/backend-architecture-reversal.plan.md` §6 (reversal-specific deferrals).
