# Demand-Driven Staff Scheduler

**Scenario 02** of a personal system-design scenarios collection. This repository is self-contained;
references below to *scenario 01* are to a sibling repo in that collection, not to anything expected
here.

🇬🇧 English · [🇻🇳 Tiếng Việt](readme.vi.md)

> ✅ **Status: the algorithm, the backend service, and the full UI are all built.** The heart of the
> exercise — `packages/scheduling-core` (Phase 1) — is complete: 97/97 specs (unit + property +
> golden-file), part of 255 across the workspace. So is the backend that serves it,
> `apps/scheduler-api` (NestJS + Fastify + CQRS + Postgres + Docker) — every write and read the
> brief asks for, plus **all five** of its optional stretch goals (§8): manual drag-and-drop roster
> editing, the coverage view, per-staff availability, roles/skills, and roster export. `apps/web`
> now covers every screen the brief's UI requirement needs — creating/listing schedules, staff and
> shift CRUD, CSV demand import, auto-schedule with a parameter panel and manual drag-and-drop
> editing, the aggregated summary, and the coverage view — end to end against the real API, not
> mocked. Live
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

## Scope — what was required, what wasn't, and where the line is

The brief asks for a clean end-to-end flow over half-finished breadth (§5) and says not to
gold-plate (§9). So it is worth stating plainly what counted as in scope, what went past it, and
which of those two things the extra work actually is.

### In scope — every requirement the brief states, built and verified end to end

| § | Requirement | |
|---|---|---|
| 2.1 | Create a schedule — one typical week, by day of week and hour | ✅ |
| 2.2 | Staff with a name and max weekly hours; add, edit, remove | ✅ |
| 2.3 | Upload the provided transaction CSV | ✅ 112 cells / 3,058 transactions — columns matched by **weekday name, never by position** |
| 2.4 | Shifts defined by start/end only, two seeded defaults, add/edit/remove | ✅ 07:00–15:00 and 15:00–23:00 |
| 2.5 | Auto-schedule: demand-aware, respects every max-hours cap, fair, adjustable afterwards | ✅ |
| 2.6 | Summary per day/hour + four week-level aggregates, **both** ratios shown | ✅ |
| 5 | A usable UI — explicitly not a command-line or API-only exercise | ✅ eight screens |

Verified by running the application against a live database and clicking through it, not only by
the test suite — the exact sequence is in [`docs/09_running_it.md`](docs/09_running_it.md).

### Past the minimum — and the distinction that matters

**The architecture is not the extra part.** The brief deliberately leaves the stack open (*"a light
backend (or even fully client-side) is fine"*), so a domain layer, a CQRS write path and a real
database are a *decision* here rather than a requirement. They are still the baseline: how these
seven features are **structured** is what decides whether the next person can change them safely,
and that is ordinary engineering rather than ornament. Concretely it costs a reviewer one extra
command — `docker compose up -d` — and the feature surface is exactly what §2 asks for, no more.

**These are genuinely beyond scope, and were built because they were the interesting part:**

- **All five stretch goals** (§8, explicitly optional): manual drag-and-drop adjustment, the
  coverage view, per-staff availability, roles/skills, and roster export.
- **Property-based testing** of the algorithm rather than example tests alone. The hard constraints
  are a property of the *algorithm*, not of any row, so they are proven over generated staff sets,
  demand grids and shift definitions — the reasoning is in
  [ADR-0001](docs/adr/0001-constraint-enforcement-strategy.md).
- **A committed decision trail** — 21 logged assumptions, six ADRs, and a plan written *before*
  each phase and left un-edited afterwards, including the predictions that turned out wrong.

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

## The auto-scheduler — the approach

Four stages, following the brief's own suggested line of thinking (§4). Full reasoning in
[ADR-0002](docs/adr/0002-auto-schedule-algorithm.md) and
[ADR-0003](docs/adr/0003-demand-to-headcount-model.md).

**1 · Demand → headcount.** `required[day][hour] = max(ceil(transactions ÷ N), 1)`. An hour is
"open" iff the imported data has a cell for it — the CSV is the only source of truth for opening
hours, so a second one can never contradict it.

**2 · Choosing `N`.** `N` is the transactions-per-staff-hour rate, and it is a **per-schedule
editable parameter, not a constant** — a magic number is indefensible the moment the dataset
changes, so what is defended here is the *method*. A **"Suggest from data"** action solves for the
`N` at which required staff-hours land at ~80% of the team's total contracted hours (a contracted
maximum is a cap, not a quota). Two corrections the real data forced: calibrate against **floor**
staff-hours, not raw required hours — the shift-quantisation gap is ~20%, since you cannot hire
someone for the 1pm hour alone. Default ships at **18**; calibration against the seed team returns
**15**, and the UI shows both rather than silently reconciling them.

**3 · Demand → shifts.** Staff are assigned to shifts, not hours, so each `(day, shift)` gets two
numbers: `floor = ceil(mean(required))` over the hours the shift touches, and
`target = max(required)` — the peak. Every shift's **floor is filled first**, then the roster tops
up toward `target`, **largest uncovered peak first**, until capacity runs out. Covering every peak
would overstaff every trough and burn hours a busier day needed more; covering the mean leaves
peaks short. This ordering makes *capacity* decide where it stops — and makes the stopping point
reportable.

**4 · Assignment + fairness.** Every candidate passes a single `FeasibilityGate` enforcing four
hard constraints in pinned order — **H4** availability, **H3** already-assigned, **H2** same-day
overlap, **H1** the contracted weekly maximum. Fairness is a **minimum utilisation target**,
default **60% of each person's own max**, measured on the *ratio*, not on absolute hours: giving a
10 h/week student and a 40 h/week supervisor the same 20 hours is unfair to both. A rebalancing
pass then moves assignments to lift under-target staff, but only where coverage does not fall.

**When it doesn't fit.** Demand exceeding capacity is *not* an error and never throws. The roster is
built as far as it goes and everything short is reported: understaffed hours, under-target staff, a
reason code for every unfilled seat, and one structural verdict comparing required staff-hours to
contracted hours. Verified live on a deliberately starved week — 272 staff-hours of demand against
70 contracted — which returns a roster of 40/40, 16/20 and 8/10 hours with zero cap violations,
plus the shortfall spelled out.

## The contrast with scenario 01 — why both exist

Scenario 01 (*Service Appointment Scheduler*, a sibling repo) is also "scheduling", and is a
different problem in every way that matters:

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
npm run infra:up        # docker-compose up -d — Postgres only
npm install
npm run db:deploy
npm run db:seed
npm run dev              # apps/scheduler-api :4102 · apps/web :3000
```

Five commands, one container, no `.env` to create — `.env` and `apps/web/.env` both ship committed
with local, non-secret values. Full detail: [`RUN.md`](RUN.md),
[`docs/09_running_it.md`](docs/09_running_it.md).

## What's here now

| Path | |
|---|---|
| [`.ai/plans/backend-architecture-reversal.plan.md`](.ai/plans/backend-architecture-reversal.plan.md) | ⭐ The plan that moved this repo from one Next.js app to a real backend + a thin frontend — what changed, why, and the phase-by-phase build order |
| [`.ai/plans/init-source.plan.md`](.ai/plans/init-source.plan.md) | The original build plan: locked decisions, the complete auto-scheduler specification measured against the real dataset, the three test layers — still the source of truth for `packages/scheduling-core`, superseded only on the app shape |
| [`docs/01_business_requirements.md`](docs/01_business_requirements.md) | The brief, quoted, plus **21 logged assumptions** |
| [`sample-data/`](sample-data/README.md) | The brief's real CSV, its measured figures, and the four ways it differs from the brief's own description of it |
| [`docs/`](docs/README.md) | Overview, use cases, architecture (+ deferred scope), data model, UI guidelines, API contracts, testing strategy, running-it, AI collaboration note |
| [`docs/adr/`](docs/adr/README.md) | Six ADRs — constraint enforcement, the algorithm, the demand→headcount model, `scheduling-core`'s zero-dependency rule, the transaction/retry boundary, role requirements as seat requirements |
| [`packages/scheduling-core/`](packages/scheduling-core/) | ✅ The algorithm, complete — 97/97 specs (unit + property + golden-file), zero runtime dependencies |
| [`packages/shared-kernel/`](packages/shared-kernel/) | CQRS bus, Unit-of-Work, errors, logger, resilience — generic infra ported once, used by `apps/scheduler-api` |
| [`apps/scheduler-api/`](apps/scheduler-api/) | ✅ NestJS + Fastify + Postgres — schedules, staff, shifts, CSV import, auto-schedule, manual roster editing, coverage view, availability, roles. Every route verified against a live database, not just unit-tested |
| [`apps/web/`](apps/web/) | ✅ Next.js — every screen built against the real `apps/scheduler-api`: schedules list/create, roles, staff (name, cap, availability and roles in one modal), demand import, shifts, roster (auto-schedule + manual/drag-and-drop editing + CSV export), summary, coverage |
| [`directives/`](directives/README.md) | The coding rulebook this repo (and any agent working on it) follows |

## Why the stack changed mid-build

The plan above wasn't followed unchanged. `init-source.plan.md` originally argued this scenario
down to one Next.js app + SQLite — none of the brief's five grading criteria is infrastructure, so
why ship a container the brief doesn't ask for? That argument is locally correct and was overruled
anyway: **this collection's own standard is that a scenario ships a real backend design**, the
same way scenario 01 does. Collapsing persistence and
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

## What I'd do next

Deliberate omissions, not forgotten ones — each has a written trigger for when it would be worth
building:

- **Overnight shifts** (e.g. 22:00–02:00) are rejected at every write path today. They spill
  staff-hours into the *next* day's cells, which changes the summary table's aggregation rather
  than just the shift record — cheap to defer, expensive to get half-right. Trigger: a 24-hour
  venue (assumption 3).
- **Multi-week / real calendar dates.** A schedule is one *typical* week by the brief's own
  framing; nothing models a specific date, so demand cannot be trended over time yet.
- **Component-level UI tests.** The logic behind the screens is unit-tested in `src/lib/`, but the
  React components themselves are verified by driving the real app in a browser. A `jsdom` layer
  would catch regressions currently caught by hand (`docs/08_testing_strategy.md` states this
  choice explicitly).
- **Prometheus/Grafana**, scaffolded for in `directives/observability_monitoring.md` and
  deliberately not wired — the API exposes `/metrics`, but nothing scrapes it at this scope.

## AI collaboration

Every phase of this repo — the original scaffold, the algorithm, the CSV importer, the backend
service, the architecture reversal itself — was built by an AI agent from a committed plan,
verified against the checks in `docs/09_running_it.md` rather than assumed correct. Full note,
including what was overridden and one "fix" that was reverted before commit:
[`docs/12_ai_collaboration.md`](docs/12_ai_collaboration.md).

**Where the work's evolution is recorded.** This scenario was developed inside a larger personal
collection and extracted with `git subtree split`, so the commit granularity is coarse — a handful
of large phase-sized commits rather than a fine-grained trail. The detailed record is committed
instead as documents: [`.ai/plans/`](.ai/plans/) holds the plan written *before* each phase (kept
as-written, never retro-edited to match what actually happened),
[`.ai/PROJECT_STATUS.md`](.ai/PROJECT_STATUS.md) is the phase-by-phase narrative, and
`.ai/memory/*.jsonl` logs every bug and lesson as it was hit — including the ones that turned out
to be my own mistakes.
