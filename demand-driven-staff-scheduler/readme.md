# Demand-Driven Staff Scheduler

**Scenario 02** of a personal [system-design scenarios](../README.md) collection.

🇬🇧 English · [🇻🇳 Tiếng Việt](readme.vi.md)

> ✅ **Status: the algorithm, the backend service, and the full UI are all built.** The heart of the
> exercise — `packages/scheduling-core` (Phase 1) — is complete: 80/80 specs (unit + property +
> golden-file). So is the backend that serves it, `apps/scheduler-api` (NestJS + Fastify + CQRS +
> Postgres + Docker) — every write and read the brief asks for, including the two stretch goals
> this repo chose to build (manual roster editing, the coverage view). `apps/web` now covers every
> screen the brief's UI requirement needs — creating/listing schedules, staff and shift CRUD, CSV
> demand import, auto-schedule with a parameter panel and manual drag-and-drop editing, the
> aggregated summary, and the coverage view — end to end against the real API, not mocked. Live
> status, phase by phase: [`.ai/PROJECT_STATUS.md`](.ai/PROJECT_STATUS.md). Original build plan
> (superseded on the architecture, still accurate on the algorithm):
> [`.ai/plans/init-source.plan.md`](.ai/plans/init-source.plan.md); the architecture reversal that
> superseded it: [`.ai/plans/backend-architecture-reversal.plan.md`](.ai/plans/backend-architecture-reversal.plan.md).

## The problem

A store manager has to plan who works, and when, across a typical week. Staffing should follow how
busy the store actually is — historical transaction counts per hour stand in for busyness — while
respecting every staff member's contracted maximum hours and giving everyone a fair share of the
work.

The brief this repository answers to is
[`SWE_Take-Home_Staff_Scheduling_System.pdf`](SWE_Take-Home_Staff_Scheduling_System.pdf), quoted
in full with the assumptions it required in
[`docs/01_business_requirements.md`](docs/01_business_requirements.md).

## Why it isn't CRUD

Six of the seven features are CRUD. The seventh — *"Auto-schedule"* — is the brief's own
*"heart of the exercise"*, and it is a constrained allocation problem with no correct answer:

- **Hard constraints** must never be violated. Nobody exceeds their contracted weekly hours; nobody
  works two overlapping shifts on the same day.
- **Soft objectives** compete. Cover the busy hours, but also give everyone a useful amount of work,
  from a pool of hours that is almost never exactly the right size.
- **There is no optimum to converge on**, so "correct" has to be defined before it can be built — and
  proven differently from how you prove a CRUD endpoint.

## How it will be solved

Hard constraints are enforced **by construction**: every assignment passes through a single
`FeasibilityGate`, and the roster can only be built from verdicts the gate produced. There is no code
path that can add an infeasible assignment — the invariant is not checked afterwards, it cannot be
broken.

Because that is a property of an algorithm rather than of a row, it is proven by **property-based
testing** over generated staff sets, demand grids and shift definitions — not by hand-picked
examples. Soft objectives are not proven at all; they are **measured** and reported.

## The contrast with scenario 01 — why both exist

[Scenario 01](../service-appointment-scheduler/) is also "scheduling", and is a different problem
in every way that matters:

| | 01 · Service Appointment Scheduler | 02 · this scenario |
|---|---|---|
| Mode | Online, transactional — one request at a time | Offline, batch — one button, a whole week |
| Core difficulty | Concurrency (time-of-check/time-of-use race) | Allocation under competing constraints |
| Correctness | A binary invariant, provable | No optimum; hard constraints provable, quality only measurable |
| Where the guarantee lives | The **database** — `EXCLUDE USING gist` makes the bad state unrepresentable | The **algorithm** — a weekly-hours cap is an aggregate over rows, which no row constraint can see |
| Proven by | A concurrency test against real Postgres | Property-based testing over generated inputs |

That last row is the point of the pair. Scenario 01 could push its guarantee into the database and
let the application code be wrong. Here only one of the three hard constraints is expressible that
way — so the guarantee moves into the algorithm, and the method of proof has to move with it.

## Quick start

```bash
docker compose up -d   # Postgres only
npm install
npm run db:deploy
npm run db:seed
npm run dev             # apps/scheduler-api :4102 · apps/web :3000
```

Five commands, one container, no `.env` to create — `.env` and `apps/web/.env` both ship committed
with local, non-secret values. Full detail: [`RUN.md`](RUN.md),
[`docs/09_running_it.md`](docs/09_running_it.md).

## What's here now

| Path | |
|---|---|
| [`.ai/plans/backend-architecture-reversal.plan.md`](.ai/plans/backend-architecture-reversal.plan.md) | ⭐ The plan that moved this repo from one Next.js app to a real backend + a thin frontend — what changed, why, and the phase-by-phase build order |
| [`.ai/plans/init-source.plan.md`](.ai/plans/init-source.plan.md) | The original build plan: locked decisions, the complete auto-scheduler specification measured against the real dataset, the three test layers — still the source of truth for `packages/scheduling-core`, superseded only on the app shape |
| [`docs/01_business_requirements.md`](docs/01_business_requirements.md) | The brief, quoted, plus **17 logged assumptions** |
| [`sample-data/`](sample-data/README.md) | The brief's real CSV, its measured figures, and the four ways it differs from the brief's own description of it |
| [`docs/`](docs/README.md) | Overview, use cases, architecture (+ deferred scope), data model, UI guidelines, API contracts, testing strategy, running-it, AI collaboration note |
| [`docs/adr/`](docs/adr/README.md) | Five ADRs — constraint enforcement, the algorithm, the demand→headcount model, `scheduling-core`'s zero-dependency rule, the transaction/retry boundary |
| [`packages/scheduling-core/`](packages/scheduling-core/) | ✅ The algorithm, complete — 80/80 specs (unit + property + golden-file), zero runtime dependencies |
| [`packages/shared-kernel/`](packages/shared-kernel/) | CQRS bus, Unit-of-Work, errors, logger, resilience — generic infra ported once, used by `apps/scheduler-api` |
| [`apps/scheduler-api/`](apps/scheduler-api/) | ✅ NestJS + Fastify + Postgres — schedules, staff, shifts, CSV import, auto-schedule, manual roster editing, coverage view. Every route verified against a live database, not just unit-tested |
| [`apps/web/`](apps/web/) | ✅ Next.js — all seven screens (plan §3.1) built against the real `apps/scheduler-api`: schedules list/create, staff, demand import, shifts, roster (auto-schedule + manual/drag-and-drop editing), summary, coverage |
| [`directives/`](directives/README.md) | The coding rulebook this repo (and any agent working on it) follows |

## Why the stack changed mid-build

The plan above wasn't followed unchanged. `init-source.plan.md` originally argued this scenario
down to one Next.js app + SQLite — none of the brief's five grading criteria is infrastructure, so
why ship a container the brief doesn't ask for? That argument is locally correct and was overruled
anyway: **this collection's own standard is that a scenario ships a real backend design**, the
same way [scenario 01](../service-appointment-scheduler/) does. Collapsing persistence and
business logic into Next.js route handlers would satisfy the brief while contradicting the reason
this repo exists in the first place. `backend-architecture-reversal.plan.md` §0 records the
correction verbatim, including the argument it overrode — kept, not deleted, because a plan that
turns out wrong is evidence, not an embarrassment to edit away.

One consequence of building the backend properly first: `apps/web`'s seven UI screens (plan §3.1)
stayed mostly unbuilt for several sessions after the backend itself was done. That was a deliberate
ordering, not a final state — the harder half (a correct, tested, Postgres-backed CQRS service) was
proven before spending time on CRUD screens a manager would recognize instantly, but the brief's
own §5 is explicit that a UI is required, not optional (*"this is not a command-line or API-only
exercise"*), so leaving it unbuilt was never going to be the resting state. Phase 3 (`.ai/PROJECT_STATUS.md`)
closed that gap: all seven screens now exist and talk to the real API. The backend remains
independently exercisable at `http://localhost:4102/docs` if that's useful for grading, but it is
no longer the only way to use this app.

## Stack

**Backend** (`apps/scheduler-api`) — NestJS + Fastify, CQRS + Hexagonal, PostgreSQL via Prisma,
Docker (Postgres only), Jest. **Frontend** (`apps/web`) — Next.js 15, App Router, Tailwind,
Vitest, talks to the backend over `fetch`, owns no database. **Algorithm** —
`packages/scheduling-core`, zero runtime dependencies, framework-free, Vitest + fast-check. Four
npm workspaces, Turborepo for build/test/lint/dev orchestration across them.

## AI collaboration

Every phase of this repo — the original scaffold, the algorithm, the CSV importer, the backend
service, the architecture reversal itself — was built by an AI agent from a committed plan,
verified against the checks in `docs/09_running_it.md` rather than assumed correct. That includes
this session's own doc reconciliation: a plan was consulted (`backend-architecture-reversal.plan.md`
§7 Phase F), and every command in `docs/09_running_it.md`/`RUN.md` was run for real, not just
written down. Full note: [`docs/12_ai_collaboration.md`](docs/12_ai_collaboration.md).
