# PLAN — Backend architecture reversal (undoing init-source.plan.md §0.0)

> **Status: Proposed, execution starting.** Written after direct user correction, not before —
> the reverse of this repo's own norm ("a plan written afterwards is a reconstruction"). Recorded
> honestly rather than pretending it was planned in advance: see §0.

## 0. What happened and why this plan exists

`init-source.plan.md` §0.0 reversed an initial NestJS+Fastify+PostgreSQL+Docker+Turborepo draft
into one Next.js app + SQLite, arguing none of the brief's five grading criteria is infrastructure.
**The user rejected that reversal.** Their correction, verbatim intent: this collection's system
design principle is that **`apps/web`'s job is a UI on top of a real backend service**, not a
replacement for one — collapsing persistence, business logic and presentation into Next.js route
handlers abandons the architecture this collection was built to demonstrate
(`../service-appointment-scheduler/` — CQRS, Hexagonal layering, a Postgres system of record, a
shared, reusable infrastructure kernel). The Palexy brief's UI requirement is satisfied by adding a
frontend *on top of* that backend, not by making the backend disappear into it.

Confirmed via `AskUserQuestion` (2026-08-17): mirror `service-appointment-scheduler` **as closely
as practical** — NestJS + Fastify, PostgreSQL + Docker, CQRS + Hexagonal + a ported shared-kernel,
Turborepo. `packages/scheduling-core` (Phase 1, already built and fully tested — 80/80 specs, the
property layer, the golden file) is **kept unchanged**: it has zero runtime dependencies by design
(ADR-0004) and was always going to be importable from anywhere. Only the layer that CALLS it moves.

## 1. What is kept vs what is rebuilt

| Kept as-is | Rebuilt |
|---|---|
| `packages/scheduling-core` — the whole algorithm, its tests, ADR-0001/0002/0003/0004 | `apps/web` — stripped to a pure frontend: no Prisma, no `src/server/`, no `src/app/api/**` route handlers |
| `docs/01_business_requirements.md`, `sample-data/` | New `apps/scheduler-api` — NestJS + Fastify, mirroring `../service-appointment-scheduler/apps/scheduler-api` |
| The AI workflow apparatus (`.claude/`, `scripts/sync.cjs`, `directives/*`) — content, not shape | New `packages/shared-kernel` — ported near-verbatim (CQRS bus, database tx-scope, errors, logger, http utils, resilience) — none of it is booking-domain-specific |
| — | `docker-compose.yml`, `turbo.json`, root `package.json` (workspaces → Turborepo tasks) |
| — | Prisma schema **moves** from `apps/web` to `apps/scheduler-api`, provider `sqlite` → `postgresql` |
| — | `docs/03_architecture.md`, `docs/04_data_model.md`, `docs/06_api_contracts.md`, ADRs — reconciled to the real shape, not left describing the collapsed one |

## 2. Target tree

```
demand-driven-staff-scheduler/
├── apps/
│   ├── scheduler-api/           NestJS + Fastify — CQRS + Hexagonal, owns Postgres
│   │   ├── prisma/              schema.prisma (postgresql) · migrations/ · seed.ts
│   │   └── src/
│   │       ├── bootstrap/       fastify.ts · server.ts · swagger.ts
│   │       ├── config/          env.config.ts · env.validation.ts · config.module.ts
│   │       ├── infrastructure/  cqrs/ · database/prisma/ · http/(filters,interceptors,pipes)
│   │       └── modules/
│   │           └── scheduling/  domain/ · application/(commands,queries) · infrastructure/ · presentation/
│   └── web/                     Next.js — UI ONLY, calls scheduler-api over HTTP
│       └── src/
│           ├── app/(ui)/…       the seven screens (init plan §3.1) — unchanged in shape
│           └── lib/api-client.ts    fetch wrapper against apps/scheduler-api
├── packages/
│   ├── scheduling-core/         ⭐ unchanged
│   └── shared-kernel/           ported from service-appointment-scheduler
├── docker-compose.yml           postgres only at first (prometheus/grafana: §6, deferred)
├── turbo.json
└── package.json                 workspaces + turbo scripts
```

## 3. The `scheduling` domain module — mapped from `booking`'s shape

| `booking` module (source) | `scheduling` module (this repo) |
|---|---|
| `domain/entities/appointment.entity.ts` | `domain/entities/{schedule,staff-member,shift,assignment}.entity.ts` — thin domain entities wrapping the Prisma row shape, validated-on-write via Zod at the boundary (unchanged rule, `directives/zod_validation.md`) |
| `domain/services/business-hours.ts`, `resource-selection.ts` | **N/A — this domain's "business logic" IS `packages/scheduling-core`.** No parallel domain service is written; command/query handlers call into `@scheduler/scheduling-core`'s pure functions directly. This is the one deliberate structural difference from `booking`, and it's ADR-0004's whole point: the algorithm already lives in a framework-free package, so the hexagonal domain layer's job here is orchestration (repository ↔ scheduling-core), not re-deriving business rules NestJS-side. |
| `application/commands/book-appointment/*` | `application/commands/{create-schedule, add-staff, define-shift, import-demand, auto-schedule, edit-assignment}/*` |
| `application/queries/check-availability/*`, `get-appointment/*` | `application/queries/{get-schedule, get-summary, get-coverage}/*` |
| `infrastructure/repositories/prisma-appointment.repository.ts` | `infrastructure/repositories/prisma-{schedule,staff,demand,shift,assignment}.repository.ts` |
| `presentation/controllers/appointments.controller.ts` | `presentation/controllers/{schedules,staff,shifts,demand,roster,summary}.controller.ts` |
| `presentation/schemas/book-appointment.schema.ts` | `presentation/schemas/*.schema.ts` — one per command/query, unchanged convention |

**`auto-schedule` command handler**, concretely — the one that matters most:

```ts
class AutoScheduleHandler {
  constructor(
    private readonly scheduleRepo: IScheduleRepository,
    private readonly assignmentRepo: IAssignmentRepository,
  ) {}

  async execute(cmd: AutoScheduleCommand) {
    const input = await this.scheduleRepo.loadSchedulingInput(cmd.scheduleId); // Prisma rows → SchedulingInput
    const result = generateRoster(input); // @scheduler/scheduling-core — the ENTIRE algorithm call
    await this.assignmentRepo.replaceAll(cmd.scheduleId, result.roster); // full replace, assumption 11
    return result; // { roster, diagnostics }
  }
}
```

Same shape for `validateRoster` (manual edits) and `summarise` (the summary query). This IS the
architectural point: Hexagonal here means the algorithm is the innermost hexagon, imported as a
pure dependency, not re-implemented against a framework.

## 4. Infrastructure ported from `shared-kernel` — none of it is booking-specific

`cqrs/` (command/query/event bus + decorators) · `database/` (`TxScope`, `AbstractTxRunner`,
`transaction.context`) · `errors/` (`AppError`, `ApplicationError`, `InfraError`) · `http/response`
utils · `logger/` (`createLogger`, redaction) · `resilience/prisma-transient-error` · `schemas/common.schema.ts`.
Ported essentially verbatim — these are generic infrastructure, exactly the kind of thing
`directives/README.md`'s litmus already says belongs to `directives/`, not to a domain.

**Not ported (yet):** `tracing/trace-context.ts`, `observability/*.metrics.ts`, Prometheus/Grafana
docker services. Deferred, not rejected — §6 states the trigger. Flagged explicitly rather than
silently dropped, because the user's correction is specifically about not silently dropping this
collection's architecture; an unstated omission here would repeat the same mistake at smaller scale.

## 5. Database: SQLite → PostgreSQL

Provider swap in `schema.prisma`, `docker-compose.yml`'s `postgres` service (mirrors
`service-appointment-scheduler`'s, env-driven: `DB_USER`/`DB_PASSWORD`/`SCHEDULER_DB_NAME`/`DB_PORT`).
Models unchanged in shape (`docs/04_data_model.md`'s six models) — only the provider and the
migration engine change. `apps/web`'s SQLite file, migration and seed script are deleted; the seed
moves to `apps/scheduler-api/prisma/seed.ts`, `apps/web/.env` is deleted (no DB access from the
frontend at all).

## 6. Explicitly deferred, with triggers (same discipline as init plan §1)

| Deferred | Trigger |
|---|---|
| Prometheus/Grafana, `tracing/trace-context.ts` | Explicit user request, or a debugging need that a log line can't answer |
| Idempotency interceptor (`booking`'s claim-before-execute) | An append-only mutation exists here (still none — auto-schedule replaces, CSV import upserts, same as init plan §1 argued) |
| Jest migration (this repo currently uses Vitest for `scheduling-core`) | `apps/scheduler-api` uses Jest to match `shared-kernel`/`booking`'s toolchain, since the ported kernel's tests are Jest-shaped; `scheduling-core` stays on Vitest — no reason to touch a green 80-test suite for consistency alone |

## 7. Execution order

| Phase | Contents |
|---|---|
| **A** | Root: `turbo.json`, root `package.json` rewritten for Turborepo, `docker-compose.yml` (postgres only), `.env`/`.env.example` for `DB_*` |
| **B** | `packages/shared-kernel` ported (cqrs, database, errors, http, logger, resilience, schemas) |
| **C** | `apps/scheduler-api` skeleton: NestJS+Fastify bootstrap, config module, Prisma module (Postgres), global exception filter, Zod pipe, health controller |
| **D** | `scheduling` domain module: entities, repositories (interfaces + Prisma impls), the six command/query handlers wired to `@scheduler/scheduling-core`, controllers + Zod schemas |
| **E** | `apps/web` reduced: delete `src/server/`, `src/app/api/**`, Prisma dependency; add `src/lib/api-client.ts`; UI screens (Phase 3 of the original plan) now call the API client instead of route handlers |
| **F** | Docs/ADR reconciliation: `docs/03`, `docs/04`, `docs/06`, `docs/09`, `readme.md`, `RUN.md`, `.ai/PROJECT_STATUS.md` — rewritten to describe the real two-app shape |

Phases A–D land the backend end-to-end for one thin vertical slice first (schedules + staff CRUD +
auto-schedule), proven with a real Postgres via `docker-compose up -d`, before the remaining CRUD
surfaces (shifts, demand import, summary/coverage) are filled in — same "prove the core, then widen"
discipline as init plan §12's phase ordering.

## References & Compliance

| Source read | What it decided here |
|---|---|
| User's direct correction (this session) + `AskUserQuestion` answers | §0's mandate: full mirror, NestJS+Fastify, Postgres+Docker, CQRS+Hexagonal+shared-kernel, `scheduling-core` unchanged |
| `../service-appointment-scheduler/apps/scheduler-api/**`, `packages/shared-kernel/**` (read, listed) | §2's target tree, §3's module mapping, §4's port list |
| `packages/scheduling-core/src/index.ts` (this repo, Phase 1) | §3's claim that no domain service layer is needed — the algorithm is already framework-free |
| `docs/01_business_requirements.md`, `docs/04_data_model.md` (this repo) | §3's model list, §5's schema swap scope |
| `../service-appointment-scheduler/directives/*` | §4's "generic infra, not booking-specific" judgment on what to port |
| `init-source.plan.md` §1 (deferred-with-a-trigger convention) | §6's format |

**Not delegated — decided by hand and open to challenge:** keeping `scheduling-core` unchanged
rather than rewriting it into the new module (§3) · deferring Prometheus/Grafana/tracing (§6) ·
Jest for `apps/scheduler-api` vs Vitest staying in `scheduling-core` (§6) · the phase-A-through-F
ordering (§7).
