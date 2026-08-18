# INIT PLAN — Demand-Driven Staff Scheduler

> **Scope of this document:** what the auto-scheduler must be, and the smallest amount of scaffolding
> that lets it be built, run and proven. The System Design Document is a separate document, written
> after init.
>
> **Written before any code.** The requirement it answers to is
> [`SWE_Take-Home_Staff_Scheduling_System.pdf`](../../SWE_Take-Home_Staff_Scheduling_System.pdf),
> quoted in `docs/01_business_requirements.md`. All demand figures below are computed from the real
> `sample-data/report_Transaction_20260807_20260813.csv`, not estimated.

---

## 0.0 Revision — the stack was reversed before execution

The first draft of this plan (2026-08-17, unexecuted) specified **NestJS + Fastify + PostgreSQL +
Docker + Turborepo + a ported CQRS shared-kernel**, mirroring scenario 01. That is recorded here
rather than deleted, because the reversal is the more useful artifact.

**Why it was wrong.** The brief asks for *"a one- or two-command setup"*, says *"do not gold-plate"*,
suggests 4–6 hours, and grades **Correctness · Problem reasoning · Code quality · User experience ·
Communication**. Not one of those five is infrastructure. A Docker dependency, a message-bus
abstraction and a build orchestrator would have been a display of infrastructure skill charged
against a budget the brief allocated to problem-solving — and they would have made a reviewer
install Docker before seeing the algorithm that is *"the heart of the exercise"*.

**What changed, and the one thing that got *better* because of it:** dropping PostgreSQL also drops
the `EXCLUDE USING gist` constraint that the first draft had justified at some length. That looks
like a loss and is not. See §0.1 — the argument is now cleaner, because it no longer has an
exception in the middle of it.

---

## 0. Decisions locked before any file is written

| Decision | Value | Why |
|---|---|---|
| Scenario name | **Demand-Driven Staff Scheduler** | Names the problem class, not the brief's title |
| App | **One Next.js 15 app** (App Router), TypeScript | UI and API in one process. No CORS, no second server, no orchestrator. `npm run dev` is the whole story. |
| Algorithm home | **`packages/scheduling-core`** — zero runtime dependencies | ⭐ The one structural decision. §2. |
| Persistence | **SQLite via Prisma** (`file:./dev.db`) | The brief permits in-memory, local storage or a database. A real schema is worth showing; a database *server* is not. No Docker, no ports, no container to be healthy. |
| Workspace | npm workspaces, **two** packages. No Turborepo. | The split exists to make "zero dependencies" provable from `package.json` (§2.1). A task orchestrator for two packages is ceremony. |
| Tests | **Vitest + fast-check** | Vitest needs no ESM/CJS bridging. fast-check is the flagship layer (§8.1). |
| Styling | Tailwind, ~6 hand-rolled primitives | A component library used at 5% costs more than it saves |
| Repo strategy | Build in the collection; `git subtree split` at submission | §11.3 |
| **Not** used | NestJS · Fastify · PostgreSQL · Docker · Turborepo · a CQRS bus · a shared-kernel port · Prometheus/Grafana · Redis | §1 |

### 0.1 ⭐ The one paragraph this repo is organised around

> **Scenario 01 pushed its correctness guarantee into the database.** A PostgreSQL
> `EXCLUDE USING gist` constraint makes two overlapping appointments *impossible to represent*, so
> the application code was allowed to be wrong.
>
> **That move is not available here — for any of the three hard constraints.** "No staff member
> exceeds their contracted weekly hours" is an **aggregate over rows**, which no row-level constraint
> can see. "No staff member works two overlapping shifts on the same day" *could* be a row constraint
> on PostgreSQL, but it would cover one rule out of three while costing a database server, a
> hand-written migration and a denormalised column. And "every hard constraint holds for a roster the
> generator invented" is a property of an **algorithm**, not of a row.
>
> So the guarantee lives in the algorithm — enforced **by construction** through a single
> `FeasibilityGate` that is the only way an assignment can enter a roster. And because the guarantee
> moved, **the method of proof has to move with it**: a hand-picked example proves the algorithm
> worked once; **property-based testing** proves the invariant holds across the input space.

Scenario 01: *make the bad state unrepresentable.* Scenario 02: *make the invariant unbreakable by
construction, and prove it over generated inputs.* Two answers to "how do you know it's right",
chosen by what the problem structurally permits. That pair is why both scenarios exist.

### 0.2 Target tree

```
demand-driven-staff-scheduler/
├── .ai/                        GOTCHAS.md · KNOWLEDGE_ARCHITECTURE.md · PROJECT_STATUS.md
│                               knowledge_builder.py · memory/*.jsonl · plans/
├── .claude/                    hooks/turn-context.cjs · settings.json
├── .github/workflows/ci.yml    typecheck · lint · test  (no services — nothing needs one)
├── apps/web/                   Next.js 15
│   ├── prisma/                 schema.prisma · migrations/ · seed.ts
│   ├── src/app/                (ui)/… + api/… route handlers
│   ├── src/components/
│   ├── src/server/             repositories, the CSV importer, use-cases
│   └── src/lib/
├── packages/scheduling-core/   ⭐ zero-dependency algorithm + property tests
├── directives/                 (trimmed port — §5)
├── docs/                       00–09 + adr/0001–0004
├── sample-data/                the real CSV + the malformed corpus
├── scripts/sync.cjs
├── AGENTS.md / CLAUDE.md / readme.md / RUN.md
├── CASE_STUDY.md / CASE_STUDY.vi.md
└── package.json (workspaces) / tsconfig.base.json
```

---

## 1. What is deliberately not built, and the trigger for each

*"Scope sensibly"* is one of the brief's stated expectations. The difference between "they didn't do
it" and "they showed why it doesn't arise yet" is the whole of that criterion, so every omission gets
a row. This table becomes `docs/03 § Deferred scope`.

| Not built | Why not | Trigger |
|---|---|---|
| A database server (Postgres/MySQL) | Single-user, single-process, explicitly no multi-user. SQLite is the correct size. | Concurrent writers, or data outliving one machine |
| DB-level constraints on the roster | §0.1 — covers at most one of three rules, at the cost of a server + a migration + a denormalised column. The gate covers all three and §8.1 proves it. | Writes arriving from a path that bypasses the application |
| Auth / multi-user / deployment | **Named out of scope by the brief** | — |
| Idempotency store | Not needed by construction: auto-schedule is a *full replace*, CSV import is an *upsert*. No append-only mutation exists. | An append-only endpoint |
| A CQRS/command bus | One process, one caller, no cross-cutting pipeline to install. Route handler → use-case → repository is the whole depth. | A second entry point (queue, cron) needing the same middleware |
| Prometheus / Grafana / tracing | Not a graded criterion here. Structured console logging only. | Deployment |
| An LP/CP-SAT solver | ADR-0003 §5 | Hard constraints multiply: skills matrix + availability + statutory rest rules + multi-site |
| Roles/skills, per-staff availability | Brief **stretch** goals 3 and 4. The `FeasibilityGate` (§7.4) already has the slot for both — H4 is specified and unimplemented. | Time remaining after §12 phase 4 |

---

## 2. ⭐ `packages/scheduling-core` — the heart, and the only thing that matters

*"This is the heart of the exercise"* is the brief's own sentence about the auto-scheduler.

### 2.1 The rule that defines the package

> Zero runtime dependencies. No React, no Prisma, no Next, no date library, no `process.env`, no
> `Date.now()`, no `Math.random()`. Plain data in, plain data out.

Enforced, not stated: `dependencies` in its `package.json` is `{}`, and `eslint` adds a
`no-restricted-imports` rule naming every framework the repo otherwise uses. Adding
`import { PrismaClient }` to any file in this package **fails lint** — that is the §10 check.

### 2.2 Why this is a decision, not a folder

| Consequence | Why it matters |
|---|---|
| Property tests run in **milliseconds with no infrastructure** | §8.1 runs thousands of generated cases per commit. A suite too slow to run stops being run. |
| Determinism is **structural**, not conventional | Nothing in the package can read a clock or a random seed, so "same input → same roster" is a fact. §8.2's golden file depends on it. |
| The graded target is **isolated from the scaffolding** | A reviewer with 20 minutes reads one package and has the whole answer. |
| *"Be ready to make or discuss small changes to the code on the spot"* (brief §6) | An algorithm change during the on-site touches one dependency-free package with a millisecond test loop. |

This is ADR-0004.

### 2.3 Public surface — frozen at init; the app codes against it

```ts
export function generateRoster(input: SchedulingInput): SchedulingResult;
export function summarise(roster: Roster, demand: DemandGrid, shifts: Shift[]): SummaryReport;
export function suggestTransactionsPerStaff(demand: DemandGrid, staff: Staff[], shifts: Shift[]): number;
export function validateRoster(roster: Roster, input: SchedulingInput): Violation[];
```

- `summarise` is **separate from generation** on purpose — the summary must be computable for a
  *manually edited* roster, or the stretch goal breaks it.
- `validateRoster` replays the **same gate** over a user-built roster. One implementation of the
  rules, two callers. A second copy for the manual path is how the two paths drift.

### 2.4 Layout

```
packages/scheduling-core/src/
├── model/         types.ts · hour-range.ts          (value objects; arithmetic only)
├── demand/        demand-model.ts                    (stage 1 — §7.2)
├── requirements/  shift-requirements.ts              (stage 2 — §7.3)
├── assignment/    feasibility-gate.ts  ⭐ the chokepoint (§7.4)
│                  assigner.ts · rebalancer.ts        (stages 3–4 — §7.5)
├── reporting/     diagnostics.ts · summary.ts        (stage 5 — §7.6, §7.7)
└── index.ts       + **/*.spec.ts + **/*.prop-spec.ts
```

---

## 3. `apps/web` — Next.js

### 3.1 Screens

| Route | Brief § | Notes |
|---|---|---|
| `/` schedules list + create | 2.1 | The only route above a schedule |
| `/s/[id]` → **Staff** | 2.2 | Table CRUD: name + max weekly hours |
| → **Demand** | 2.3 | CSV drop zone → import result (accepted / warnings / errors) → day×hour heatmap |
| → **Shifts** | 2.4 | CRUD, seeded with 07:00–15:00 and 15:00–23:00 |
| → **Roster** | 2.5 | Auto-schedule button, the parameter panel (§7.6), day×shift grid, manual add/remove |
| → **Summary** | 2.6 | The aggregated table + the four week totals |
| → **Coverage** | stretch 2 | Required vs scheduled per hour; gaps and overstaffing. Nearly free once §7.6 exists. |

### 3.2 Three UI rules taken directly from the grading criteria

1. *"Clear enough for a **non-technical manager**"* — "Hours booked vs. contracted", not "utilisation
   ratio". Every red cell says what to do about it.
2. **The two week-level averages must be explained in the UI**, not merely displayed (§7.7). Showing a
   manager two different numbers both labelled "transactions per staff hour" with no explanation
   means they trust neither.
3. **Never fail silently** — the brief says this twice. Import errors, uncovered hours and unused
   capacity are UI states, not console logs.

### 3.3 Data model (Prisma / SQLite)

| Model | Fields |
|---|---|
| `Schedule` | `id` · `name` · `transactionsPerStaffHour` · `minStaffWhenOpen` · `minUtilisationTarget` · timestamps |
| `StaffMember` | `id` · `scheduleId` · `name` · `maxWeeklyHours` |
| `DemandCell` | `id` · `scheduleId` · `dayOfWeek` 1–7 · `hour` 0–23 · `transactions` — **unique `(scheduleId, dayOfWeek, hour)`** so re-import upserts |
| `Shift` | `id` · `scheduleId` · `label` · `startMinute` · `endMinute` |
| `Assignment` | `id` · `scheduleId` · `staffId` · `shiftId` · `dayOfWeek` · `source` `AUTO`\|`MANUAL` |
| `ScheduleRun` | `id` · `scheduleId` · `generatedAt` · `parameters` json · `diagnostics` json |

`ScheduleRun` earns its row: it is the draft's provenance — which parameters produced this roster and
what it could not cover — so the coverage view reads a stored answer instead of recomputing one that
might disagree.

**Shifts are stored as minutes-from-midnight, not `TIME`.** Every consumer immediately converts a
time to a number to intersect it with an hour cell; storing the number the arithmetic uses removes a
conversion at every boundary and lets `scheduling-core` stay date-library-free (§2.1). It also forces
the overnight question to be answered explicitly rather than accidentally — see assumption 3.

---

## 4. The real CSV — four ways it differs from the brief's own description

The brief's §3 shows a clean `Hour | Fri | Sat | …` table. The actual file does not look like that,
and each difference breaks a different naive assumption:

```
﻿"Aug 07, 2026 - Aug 13, 2026"
,"Fri, 07 Aug","Sat, 08 Aug","Sun, 09 Aug","Mon, 10 Aug","Tue, 11 Aug","Wed, 12 Aug","Thu, 13 Aug"
7am,22,13,7,12,22,13,16
…
10pm,5,5,6,7,2,6,6
```

| # | Reality | What it breaks |
|---|---|---|
| 1 | **A title row precedes the header:** `"Aug 07, 2026 - Aug 13, 2026"` | Any parser that treats line 1 as the header. Detect the header as *the first row whose remaining cells parse as day labels*, not as "row 0" or "row 1". |
| 2 | ⚠️ **Day labels contain a comma inside quotes** — `"Fri, 07 Aug"` | `line.split(',')` shreds a 8-column header into 15 fields. **A real quoted-field CSV parser is mandatory**, and this is the single most likely way to get a plausible-looking wrong answer. The brief's own table would have led straight to the naive version. |
| 3 | **The header's first cell is empty**, not `Hour` | Any parser keying on a literal `"Hour"` column name |
| 4 | **A UTF-8 BOM** precedes the title row | `"﻿Aug 07…"` fails a string comparison that looks obviously correct |

Plus, as expected: the columns run **Fri…Thu** while the app displays Mon–Sun. Days are matched by
extracting the weekday token from a compound label, **never by position** — reading positionally
rotates the whole week and every downstream number stays plausible (assumption 8).

Importer contract: returns `{ cells, warnings, errors }` with row/column-precise messages. **Never
throws to the client.** Missing day → warning + a grid with gaps. Non-numeric cell → located error.

Test corpus in `sample-data/malformed/`: the real file · reordered columns · a missing day · a
non-numeric cell · duplicate hour rows · an empty file · a header-only file · no BOM · CRLF · the
brief's *idealised* `Hour,Fri,Sat,…` layout (it must accept that too).

---

## 5. Ported apparatus — trimmed hard

From `../service-appointment-scheduler/`. **Nothing from `packages/shared-kernel` is ported** — it is
Nest/Prisma-transaction-shaped infrastructure for a problem this app does not have.

| Port | What | Note |
|---|---|---|
| ✅ | `.claude/settings.json`, `hooks/turn-context.cjs`, `scripts/sync.cjs`, `.ai/knowledge_builder.py` | The AI workflow. Cheap (4 files) and it feeds a **graded deliverable** — the brief requires an AI-usage note. |
| ✅ | `.ai/KNOWLEDGE_ARCHITECTURE.md`, `AGENTS.md`, `CLAUDE.md` | Structure ported, content rewritten. `CLAUDE.md` mirrors rather than links. |
| ✅ | `directives/`: `README.md` · `naming_conventions.md` · `domain_modeling.md` · `testing_standard.md` · `qa_standard.md` · `memory_sop.md` · `zod_validation.md` | Seven, down from thirteen |
| ✅ new | `directives/frontend_standard.md` | Does not exist in scenario 01 (backend-only there). UI is graded here. |
| ⚠️ | `testing_standard.md` **must be extended** | It has no property-based-testing section, and §8.1 makes that the flagship layer. Write the fast-check conventions: arbitraries co-located, failing seeds committed, shrinking respected. |
| ❌ | `cqrs_pattern.md` · `database_standard.md` (Postgres-specific) · `logging_standard.md` · `idempotency_strategy.md` · `resilience_patterns.md` · `observability_monitoring.md` · `folder_structure_sop.md` | Each governs a thing §1 does not build |

**Acceptance for §5** — run them, do not eyeball. Scenario 01's commit `ddc46b2` is the warning: both
hooks were *silently blinded* by a path change and kept reporting "clean".

```bash
node .claude/hooks/turn-context.cjs   # valid JSON on stdout, exit 0
node scripts/sync.cjs                 # exit 0, regenerates .ai/KNOWLEDGE_INDEX.md
```

Then edit a file under `packages/scheduling-core/src/` and confirm the hook reports After-Task debt.

---

## 6. `docs/` and the ADRs

`00_overview` · `01_business_requirements` ✅ *(written)* · `02_use_cases` · `03_architecture`
(incl. **`§ Deferred scope`** = §1) · `04_data_model` · `05_ui_guidelines` · `06_api_contracts` ·
`08_testing_strategy` · `09_running_it` · `12_ai_collaboration` · `adr/README.md`.

| ADR | Subject | Rejected alternatives it must name |
|---|---|---|
| `0001-constraint-enforcement-strategy.md` | ⭐ **Flagship.** §0.1 — hard constraints by construction through one gate; property-based proof; why no row-level constraint reaches any of the three | Post-hoc validate-then-reject · a DB trigger doing an aggregate per insert · PostgreSQL `EXCLUDE` for the overlap rule only · example-based tests alone |
| `0002-auto-schedule-algorithm.md` | Greedy fairness-first assignment + bounded local-search rebalance | LP/CP-SAT (OR-Tools) · simulated annealing · pure round-robin · exhaustive search. **Must state the T5 trigger.** |
| `0003-demand-to-headcount-model.md` | Transactions → required staff: the choice of `N`, the minimum, and peak-vs-mean within a shift | A fixed headcount per shift · a queueing model (Erlang C) · regression on historical staffing |
| `0004-scheduling-core-as-a-pure-package.md` | §2 | Algorithm as a server module · algorithm in the React tree · algorithm in SQL |

> **Every ADR names a rejected alternative.** One that doesn't is a description.
>
> ADR numbering starts at 0001 because no ported source cites a filename. (Scenario 01 could not
> renumber: ~20 comments in its shared-kernel name `0001-transaction-retry-boundary.md` verbatim.
> Nothing is ported here, so the constraint is gone with it.)

---

## 7. ⭐ The auto-scheduler — full specification

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

### 7.1 The real data, measured

Computed from the committed CSV — 16 open hours × 7 days = **112 cells, none empty**:

| | |
|---|---|
| Total transactions / week | **3,058** |
| Busiest cell | **64** — 1pm Friday |
| Quietest cell | **2** — 10pm Tuesday |
| Busiest hour of the week (all days) | 1pm — 329 |
| Quietest hour | 10pm — 37 |
| Per-day totals | Sat 508 · Thu 470 · Tue 453 · Fri 452 · Wed 393 · Mon 392 · Sun 390 |

The days are remarkably flat (390–508); **the variance is almost entirely within the day**, 7am/10pm
against the 1pm peak. That single observation is what makes stage 2 the interesting stage: the
problem is not "which days need more people", it is "a shift contains both the 1pm peak and the 10pm
lull, and a person is assigned to the whole shift."

### 7.2 Stage 1 — demand → required staff (ADR-0003)

```
required[d][h] = clamp(ceil(transactions[d][h] / N), minStaffWhenOpen, maxStaffPerHour)
                 when open at (d,h); 0 otherwise
```

- **Open** ⟺ a demand cell exists. The sample covers 07:00–23:00. No separate opening-hours model
  (assumption 2).
- **`minStaffWhenOpen`** default `1` — the brief's *"a sensible minimum (such as one)"*.
- **`maxStaffPerHour`** optional, off by default; a store has a floor size.

**Choosing `N` — the brief's *"You choose N and justify it"*.** Measured against the real file:

| `N` | required staff-hours | **floor** staff-hours | target staff-hours | peak headcount |
|---:|---:|---:|---:|---:|
| 10 | 361 | 408 | 512 | 7 |
| 12 | 306 | 344 | 440 | 6 |
| 15 | 257 | 296 | 352 | 5 |
| **18** | 226 | **272** | 304 | 4 |
| 20 | 210 | 264 | 288 | 4 |
| 25 | 173 | 216 | 240 | 3 |
| 30 | 162 | 200 | 208 | 3 |

Two things this table shows that no amount of prose would:

1. **The gap between column 2 and column 3 is the cost of shifts existing.** At `N`=18, the hours
   genuinely demand 226 staff-hours but the roster must commit **272** — you cannot hire someone for
   the 1pm hour alone. That quantisation loss, ~20%, is structural, and it is what the Summary view's
   overstaffed quiet hours are actually showing. It is not a bug to be tuned away.
2. **The `floor`→`target` gap is the peak-coverage premium.** At `N`=18 covering every peak costs 304
   instead of 272 — 12% more hours for the busiest hour of each shift.

`N` ships as an **editable per-schedule parameter** with a **"Suggest from data"** action
(`suggestTransactionsPerStaff`) that binary-searches for the `N` where
`floorStaffHours(N) ≈ targetUtilisation × Σ maxWeeklyHours`.

> ⚠️ **Calibrate against `floor`, not against raw required staff-hours** — `floor` is what the
> assigner must actually commit in whole shifts. Calibrating against column 2 under-provisions by the
> full quantisation gap. *(The first draft of this plan said "required staff-hours"; the table above
> is what corrected it.)*
>
> ⚠️ **And against a target utilisation (default 80%), not against 100% of capacity** — a contracted
> maximum is a **cap, not a quota**. Calibrating to 100% produces an `N` that schedules every person
> to their legal limit every week, which is an answer no manager wants.

For the §7.8 seed team (12 staff, 368 contracted hours), that yields **`N` ≈ 18** — 272 floor
staff-hours against a 294-hour target. The README states that number **and this table**, rather than
asserting a constant.

### 7.3 Stage 2 — required per hour → headcount per shift (ADR-0003)

The brief: *"decide how many people each shift needs on each day so that the busiest hours within
that shift are adequately covered."* Per §7.1 this is where the real difficulty is.

Two targets per `(day, shift)`, not one:

```
floor[d][s]  = ceil( mean( required[d][h] for h in s ) )   // never leave the shift thin
target[d][s] = max ( required[d][h] for h in s )           // cover the peak
```

Peak-everywhere overstaffs every trough and burns hours a busier shift needed more (the 12% above).
Mean-everywhere leaves peaks short. **So: fill `floor` for every `(day, shift)` first, then top up
toward `target` in order of largest uncovered peak.** Capacity — not the target — decides where it
stops, and stage 5 reports exactly where.

**Overlapping shifts:** process in `startMinute` order, subtracting coverage already committed by
earlier shifts. The two seeded shifts tile 07:00–23:00 exactly; a user-created set may not.

### 7.4 ⭐ Stage 3a — the `FeasibilityGate`

```ts
class FeasibilityGate {
  constructor(private readonly input: SchedulingInput) {}
  eligible(staffId: StaffId, day: DayOfWeek, shift: Shift, state: RosterState): Eligibility;
}
```

| # | Hard constraint | Reason code |
|---|---|---|
| H1 | `state.hours(staffId) + shift.hours <= staff.maxWeeklyHours` | `WOULD_EXCEED_MAX_HOURS` |
| H2 | No overlap with a shift already assigned to this staff on this day | `OVERLAPS_EXISTING_SHIFT` |
| H3 | Not already assigned to this exact `(day, shift)` | `ALREADY_ASSIGNED` |
| H4 | *(stretch)* available that day | `UNAVAILABLE` |

**The structural rule that makes ADR-0001 true:** `RosterState` exposes exactly one mutator —
`commit(e: Eligibility)` — and `Eligibility` is a nominal type that only `FeasibilityGate` can
construct. No code path, present or future, can add an assignment without a gate verdict. The
invariant is not validated afterwards; **it cannot be expressed broken.**

`validateRoster` replays the same gate over a user-edited roster, so the manual path (stretch goal 1
— exactly where a human creates an overlap) answers to one implementation of the rules.

### 7.5 Stages 3b–4 — assignment, and what "fair" means

The brief: *"nobody scheduled for zero or near-zero hours while others are maxed out"* and *"Define
what 'enough hours' means … and apply it consistently."*

**The definition committed to:** a **minimum utilisation target** `U_min`, default **60%** — every
staff member should reach `U_min × maxWeeklyHours`, **if total demand permits**. Measured on the
utilisation *ratio*, never on absolute hours: giving a 16 h/week student and a 40 h/week supervisor
the same 20 hours is unfair to both. The conditional is load-bearing — when demand cannot support it,
stage 5 says so instead of the algorithm pretending.

Three deterministic passes (ties broken by `(name, id)`; never insertion order, never random):

1. **Fairness pass** — walk the `floor` seats, preferring eligible staff **below `U_min`**, lowest
   utilisation first. Nobody sits near zero while seats remain.
2. **Coverage pass** — fill remaining `floor` seats, then top up toward `target` (largest uncovered
   peak first), always choosing the lowest-utilisation eligible staff.
3. **Rebalance pass** — bounded local search. Take the (most-loaded, least-loaded) pair and try
   moving one assignment. Accept only if the gate approves, coverage does not fall, and the max−min
   utilisation gap strictly shrinks. Hard cap 200 iterations; terminates when no improving move
   exists.

`O(days × shifts × staff)` per pass plus a bounded search — sub-millisecond at this size, which is
what makes §8.1's thousands of generated cases affordable.

### 7.6 Stage 5 — diagnostics ("surface the outcome, don't fail silently")

`generateRoster` never throws and never silently drops a seat:

| Output | Content |
|---|---|
| Per hour | `required` vs `scheduled` → `UNDERSTAFFED` / `OK` / `OVERSTAFFED`, with magnitude |
| Per staff | assigned hours · contracted max · utilisation % · `belowTarget` flag |
| Per unfilled seat | `(day, shift)` + the reason code that blocked **every** candidate |
| Structural verdict | total floor staff-hours vs total contracted capacity — the one number explaining all the others: *"the roster needs 272 staff-hours; the team is contracted for 368; 12 peak seats went unfilled because filling them would have pushed four people over their weekly maximum."* |

Tunables live on `Schedule` (§3.3), editable in the UI, not baked into env:
`transactionsPerStaffHour` · `minStaffWhenOpen` · `minUtilisationTarget` · `maxStaffPerHour?`

### 7.7 The summary report (brief 2.6) — the arithmetic, pinned

Per `(day, hour)` cell: `transactions` · `staffHours` · `transactions ÷ staffHours`, rendered **`–`
when `staffHours` is 0**.

```
staffHours(d,h) = Σ over assignments covering that hour of  overlap(shift, hour) ÷ 60
```

With whole-hour shifts this reduces to *"the number of staff on shift during that hour"* — exactly as
the brief states — but stays correct if a shift ever starts at 07:30, at zero extra cost
(assumption 4).

Week totals, **all four**:

| Metric | Formula |
|---|---|
| Total staff hours | `Σ staffHours` |
| Total transactions | `Σ transactions` = **3,058** for the sample |
| Transactions per staff hour (overall) | `total ÷ total` — **weighted** by staff hours |
| Average transactions per staff hour | mean of per-cell ratios, **over cells with staff** — **unweighted** |

The last two differ whenever staffing is uneven across cells, which is always. The brief flags this
and asks for both; §3.2 rule 2 requires the UI to explain it. The brief's illustrative day
(33 + 48 + 33 = 114 over 8 staff-hours = 14.3) becomes a unit test.

> Two different behaviours hang off `staffHours = 0`: the cell renders `–`, **and** the cell is
> excluded from the unweighted mean. Getting one right and the other wrong is the likely bug.

### 7.8 The seed — designed so the demo shows something

A seed where everything fits proves nothing. The seeded team is **12 staff, 368 contracted hours**:
3 × 40h · 5 × 32h · 3 × 24h · 1 × 16h.

Against `N` = 18 (§7.2) and the two default shifts:

| | seats | staff-hours |
|---|---:|---:|
| Team capacity | 46 | 368 |
| `floor` — must be filled | 34 | 272 |
| `target` — full peak coverage | 38 | 304 |
| `U_min` = 60% — minimum to be "fair" | 32 | — |

`U_min (32) < floor (34) < target (38) < capacity (46)`. That ordering is the whole demo: **the floor
is coverable, fairness is achievable, full peak coverage is not**, and there is genuine slack so the
allocation is a real choice rather than forced. Unequal maxima are mandatory — with identical
contracts, fairness-on-ratio and fairness-on-hours coincide and the §7.5 decision becomes invisible.

---

## 8. Correctness — three layers, each proving what the others structurally cannot

| Layer | Tool | Proves | Cannot prove |
|---|---|---|---|
| **1 ⭐ Property-based** | fast-check over `scheduling-core` | For **arbitrary** staff sets, demand grids and shift sets: H1–H3 always hold · the function is total · same input → same roster | That the app is wired up. That the roster is *good*. |
| **2 Golden file** | Vitest snapshot on the real CSV | The exact roster, summary and diagnostics for the committed dataset, incl. the brief's illustrative arithmetic. Catches unintended behaviour change. | Anything about other inputs |
| **3 Integration** | Vitest + a real SQLite file | Route handlers, the importer's graceful failures on the whole malformed corpus, and that `validateRoster` rejects an illegal **manual** edit | Generality; algorithm quality |

**Layer 1 is the flagship** — the direct analogue of scenario 01's concurrency test. Its arbitraries
must *deliberately* generate the degenerate cases, not hope random draws find them: zero staff · one
staff · `maxWeeklyHours = 0` · a max smaller than one shift · all-zero demand · a single enormous
spike · more shift-hours than the team can legally cover · overlapping shift definitions · a shift
covering no whole hour.

> ⚠️ **A property test over tame inputs proves nothing and looks rigorous** — which is worse than no
> test. The arbitraries are the test; the assertions are the easy half.

**On quality, be honest:** none of this proves the roster is *optimal* — nothing can, because no
optimum is defined. What is measured instead, and reported in the README with numbers from the real
dataset: coverage rate, the max−min utilisation gap **before and after** the rebalance pass, and the
fraction of staff reaching `U_min`. Measured, not claimed.

---

## 9. Running it — a graded requirement

*"We must be able to start it locally by following your README. Prefer a one- or two-command setup."*

```bash
npm install     # postinstall: prisma generate → migrate → seed if the db is empty
npm run dev     # http://localhost:3000
```

Two commands, no Docker, no `.env` required (SQLite path has a default; `.env.example` exists for
overrides only). **Verified from a clean clone as part of §10** — a README instruction that has never
been executed from scratch is a guess.

---

## 10. Verification — init is done when all of these pass

```bash
npm install && npm run dev        # reaches the UI
npm run typecheck                 # zero errors
npm run lint
npm test                          # core specs green, not zero
node scripts/sync.cjs             # exit 0, regenerates the index
node .claude/hooks/turn-context.cjs
```

- [ ] `packages/scheduling-core/package.json` → `"dependencies": {}`
- [ ] Adding `import { PrismaClient } from '@prisma/client'` to any core file **fails lint**
- [ ] `grep -ri "nestjs\|fastify\|postgres\|docker\|turbo" . --exclude-dir=node_modules` → 0 hits outside this plan's §0.0
- [ ] `grep -ri "appointment\|dealership\|technician" apps/ packages/ docs/ directives/` → 0 hits
- [ ] The importer parses the real CSV into **112 cells totalling 3,058** (§7.1) — the first assertion written, before any UI
- [ ] `.ai/memory/*.jsonl` exist and are **empty**
- [ ] The turn-context hook reports debt after an edit under `packages/scheduling-core/src/`
- [ ] ⭐ **Fresh clone → the two commands in §9 → a working UI**, on a machine with no `.env`

---

## 11. Deliverables

### 11.1 What the brief asks for

| Required | Lands in |
|---|---|
| GitHub repo + seed/sample data for a full end-to-end demo | repo root · `sample-data/` · `prisma/seed.ts` (§7.8) |
| README: install/run · **the auto-scheduler approach** · **assumptions** | `readme.md`, from ADR-0002/0003 and `docs/01` |
| **AI-usage note**: delegated / verified / overridden | `readme.md` §, from `docs/12_ai_collaboration.md` |
| On-site: run it, walk the code, change it live | §2.2 row 4 |

### 11.2 What the collection asks for

`CASE_STUDY.md` + `CASE_STUDY.vi.md` against the seven criteria groups (A–G), and a row in
`../README.md` / `../README.vi.md`. **Written last, from what the build produced.** The §0.1
contrast with scenario 01 belongs here — it is the reason both exist.

### 11.3 Submission mechanics

```bash
git subtree split --prefix=demand-driven-staff-scheduler -b staffing-submission
```

Push that branch to a fresh repository as `main`. *"Keep commit history intact"* is satisfied by
construction, and graders never see scenario 01 or the collection framing.

> **Consequence for committing:** every commit must be scoped to this folder alone. A commit touching
> both this folder and `../README.md` splits into a confusing partial. Update the collection README
> in its own commits.

---

## 12. Execution order

| Phase | Contents | Gate |
|---|---|---|
| **0 · Init** | Workspace, Next.js app, Prisma schema + first migration, `scheduling-core` skeleton, the trimmed apparatus (§5), doc scaffolds | §10 fully green |
| **1 · ⭐ The algorithm** | `scheduling-core` complete (§7.2–§7.7), TDD, with §8.1's property tests written **alongside** | Property tests green · the brief's illustrative arithmetic passes · **no database, no HTTP, no React involved** |
| **2 · Import + persistence** | The CSV importer against the real file and the whole malformed corpus (§4), repositories, route handlers, the seed (§7.8) | 112 cells / 3,058 transactions asserted · every malformed input returns a located error, never a throw |
| **3 · UI** | §3.1's seven screens | Fresh clone → §9's two commands → a full auto-schedule through the UI |
| **4 · Stretch + measurement** | Coverage view, manual editing, CSV export; the measured-quality numbers for the README (§8) | — |
| **5 · Docs + submission** | Four ADRs, `readme.md` **written from the artifacts**, `docs/12`, `CASE_STUDY.*`, §11.3 split | §10's fresh-clone check re-run on the split repo |

**Phase 1 before phase 2 is deliberate.** The algorithm is what the brief grades as the heart of the
exercise, it needs no infrastructure, and if time runs out everything after it is scaffolding around
a proven core. Building the plumbing first inverts that risk.

Throughout, not at the end: log to `.ai/memory/*.jsonl` after each task and fill `docs/03 § Deferred
scope` as each §1 boundary is hit. Both feed deliverables that cannot be reconstructed later.

---

## References & Compliance

| Source read | What it decided here |
|---|---|
| `SWE_Take-Home_Staff_Scheduling_System.pdf` §§1–9 | Every requirement in §7 · the scope in §1 · the deliverables in §11.1 · **the reversal in §0.0** (its five grading criteria contain no infrastructure) |
| `sample-data/report_Transaction_20260807_20260813.csv` (measured, not read about) | §7.1's figures · §7.2's calibration table and the `N` ≈ 18 default · §7.8's seed design · **§4's four parser traps**, none of which are visible in the brief's description of the same file |
| `../service-appointment-scheduler/.ai/plans/init-source.plan.md` | The shape of this document; the deferral-with-a-trigger convention (§1) |
| `../service-appointment-scheduler/docs/adr/0002-booking-concurrency-control.md` | §0.1's contrast and ADR-0001's framing |
| `../service-appointment-scheduler/.ai/PROJECT_STATUS.md` | §5's hook warning (commit `ddc46b2`, silently blinded hooks) |
| `../service-appointment-scheduler/directives/README.md`, `testing_standard.md` | §5's port table and the property-testing gap that must be written |
| `../README.md` (collection) | §11.2's seven criteria groups |

**Not delegated — decided by hand and open to challenge:** the fairness definition (`U_min`, §7.5) ·
the floor/target split (§7.3) · calibrating `N` against *floor* hours at 80% of capacity rather than
asserting a constant (§7.2) · the zero-dependency package (§2) · the seed sized so the demo has a
visible shortfall (§7.8) · and the stack reversal in §0.0.
