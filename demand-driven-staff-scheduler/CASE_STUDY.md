# Case Study 02 · Demand-Driven Staff Scheduler

**Turning historical transaction counts into a fair weekly roster — a constrained-allocation
problem with no single correct answer, not a CRUD app with an extra button.**

🇬🇧 English · [🇻🇳 Tiếng Việt](CASE_STUDY.vi.md)

> This is the **door into the scenario** — written for someone learning from it, not for someone
> reviewing a spec. It answers the seven criteria groups defined in the
> [collection README](../README.md), and links out to the spec documents for detail rather than
> repeating them.
>
> | You want | Go to |
> |---|---|
> | To run it | [`RUN.md`](RUN.md) |
> | The formal system design document | [`docs/03_architecture.md`](docs/03_architecture.md) |
> | The one decision that matters most | [`ADR-0001`](docs/adr/0001-constraint-enforcement-strategy.md) |
> | The requirement → code → test map | [`readme.md`](readme.md) |

---

# A · Problem identity

## A.1 In one sentence

Given a week of historical hourly transaction counts and a roster of staff each with a maximum
weekly-hours contract, draft a full week's shift assignment where **no staff member ever exceeds
their cap or works two overlapping shifts on the same day**, busier hours get more coverage than
quiet ones, and no one is left near-idle while someone else is maxed out — knowing in advance that
there is no single "correct" roster to converge on, only a defensible one.

## A.2 Domain

Retail and service-industry workforce operations — the part of running a shop, café, call centre
or warehouse that never stops being a human problem: who works when, given that demand is not
flat and people are not interchangeable hours.

## A.3 The real-world pain

Without a system, this is a spreadsheet a manager rebuilds by hand every week, from memory and a
gut feeling for "Fridays are busy." What that process cannot do:

| Failure | What actually happens |
|---|---|
| **Peaks under-covered** | The manager remembers last month's rush, not this week's actual hourly pattern, so Friday 1pm — the real busiest hour in the sample data used here — gets the same headcount as Tuesday 1pm. |
| **Troughs over-covered** | Nobody wants to be the one cutting a shift short, so the safe move is scheduling everyone for their usual hours regardless of whether 10pm needs three people or one. |
| **Unfair hour distribution** | Whoever the manager scheduled first, or asked first, gets the good hours. There is no mechanism forcing an even look at everyone's utilisation — a part-timer can sit at 20% of their cap for weeks without anyone noticing, because nothing measures it. |
| **A cap is an assertion, not a guarantee** | Someone gets scheduled 45 hours against a 40-hour contract because the manager added one more shift without re-adding up the week by hand. |
| **No record of "why"** | When a shift ends up understaffed, there's no trace of whether that was a deliberate trade-off (not enough staff-hours to go around) or a mistake. Next week repeats it. |

Each of these fails silently on a spreadsheet — nothing turns red until a customer notices the
queue, or a staff member notices their paycheck.

## A.4 Who has this problem

Directly:

- **Any hourly-shift retail or service business** — the scenario as written, using a real
  transaction-count dataset from a physical store.
- Anyone converting **a measurable demand signal into a headcount, then a headcount into shifts**.

The same problem, renamed:

| Industry | "Transaction count" becomes | "Shift" becomes |
|---|---|---|
| Call centre | Calls per hour | An agent's rostered block |
| Restaurant | Covers per hour | Front-of-house / kitchen shift |
| Warehouse / fulfilment | Orders per hour | A pick-pack shift |
| Hospital ward (non-clinical staffing) | Patient census per hour | A nursing shift |
| Ride-hailing / delivery ops | Ride/delivery requests per hour | A driver's active window |
| Transit | Ridership per hour | A driver/conductor shift |

If you can say *"we have a demand curve that varies by hour, and people who can only work so many
hours a week"* — this is your problem, whatever your industry calls it.

## A.5 Prevalence · ★★★★★

- **Every hourly-paid retail or service business does this, every week**, usually on a spreadsheet
  or a whiteboard — this is one of the most common unsolved-by-software problems in small and
  mid-size operations, not a rare specialist need.
- It's also a problem most in-house spreadsheets get **quietly wrong** — an unfair roster or an
  uncovered peak doesn't throw an error, it just costs revenue or morale invisibly (§C).
- Beyond retail: the underlying shape — *"convert a demand signal into a headcount, then satisfy
  competing hard and soft constraints over a finite pool of people"* — is the same shape as nurse
  rostering, call-centre workforce management, and airline crew scheduling (all, famously, much
  harder versions of the same core problem).

## A.6 Aliases

You will meet this problem under: *workforce scheduling* · *shift scheduling* · *staff rostering* ·
*labor demand planning* · *employee scheduling optimization* · in academia, a constrained variant
of the *Nurse Rostering Problem* — a well-known NP-hard combinatorial optimisation family this
scenario deliberately does not attempt to solve exactly (§D.4).

---

# B · Requirements

## B.1 Functional — quoted verbatim from the brief

The scenario implements
[`SWE_Take-Home_Staff_Scheduling_System.pdf`](SWE_Take-Home_Staff_Scheduling_System.pdf), quoted
in full with every logged assumption in
[`docs/01_business_requirements.md`](docs/01_business_requirements.md):

> 2.1 **Create a schedule.** The top-level container for staff, transactions, shifts and the
> generated roster.
> 2.2 **Add staff and their maximum weekly hours.** Add, edit, remove.
> 2.3 **Upload transaction (demand) data**, imported from the provided CSV.
> 2.4 **Define shifts** — only a start time and an end time. Seed two defaults: 07:00–15:00 and
> 15:00–23:00. Add, edit, remove.
> 2.5 **Auto-schedule.** One button drafts a sensible weekly schedule: busier hours covered by more
> staff, every staff member's maximum weekly hours respected, and *"a fair, useful amount of
> work — nobody scheduled for zero or near-zero hours while others are maxed out."*
> 2.6 **Aggregated summary view** — per-cell and four week-level totals, including two
> transactions-per-staff-hour figures that *"can differ from [each other]; show both."*

And on the algorithm itself (brief §4): *"This is the heart of the exercise. There is no single
correct algorithm; we are looking for a defensible approach and clear reasoning."*

## B.2 What was built

Every route above, plus both of the brief's stretch goals this repository chose to build —
[full contract](docs/06_api_contracts.md):

| Endpoint | Purpose |
|---|---|
| `POST /schedules`, `GET /schedules/:id` | Create/read the container (2.1) |
| `POST/PATCH/DELETE .../staff` | Staff CRUD (2.2) |
| `POST .../demand/import` | The CSV importer — a real quoted-field parser, never a bare failure (2.3) |
| `POST/PATCH/DELETE .../shifts` | Shift CRUD (2.4) |
| `POST .../auto-schedule` | The algorithm — a full replace, idempotent by construction (2.5) |
| `GET .../summary` | The aggregated view, both transactions-per-staff-hour figures, explained not just shown (2.6) |
| `POST/DELETE .../roster/assignments` | **Stretch goal 1** — manual roster editing, gated by the same `FeasibilityGate` the auto-scheduler uses |
| `GET .../coverage` | **Stretch goal 2** — required vs scheduled per hour, recomputed live so a manual edit never leaves it stale |

## B.3 Non-functional requirements — and what was honestly not measured

| Property | Position taken | Honest status |
|---|---|---|
| **Hard-constraint correctness** | The single non-negotiable — no staff member ever exceeds their cap or double-books a day. Enforced by construction, not checked after the fact. | **Proven** by property-based testing over generated staff/demand/shift inputs, not hand-picked examples (§E) |
| **No optimum claimed** | The brief states there is no single correct algorithm. This repo does not claim one either. | By design — quality is *measured* (coverage rate, utilisation spread), never asserted as "optimal" |
| **Determinism** | Same input twice → structurally identical roster. | By construction — every tie-break is `(name, id)`, never insertion order or randomness, which is also what makes the golden-file test layer possible |
| **Never fail silently on bad input** | A malformed CSV row is a located error, not a thrown exception or a 500. | Built and tested against a corpus of malformed variants, live over real HTTP (`.ai/PROJECT_STATUS.md`'s Phase D log) |
| **Latency** | Auto-schedule is `O(days × shifts × staff)` per pass plus a bounded rebalance search (hard cap 200 iterations) — sub-millisecond at this scale. | No load test run — this scale (tens of staff) doesn't warrant one; the complexity bound is stated rather than a made-up number |
| **Scalability of the algorithm itself** | An LP/CP-SAT solver would scale further but was rejected for this size (§D.4). | Deliberately deferred, with the trigger stated |
| **Availability / auth / multi-tenancy** | None. Single-user, single-process, no accounts. | Out of scope, stated by the brief itself |

## B.4 Explicit non-goals

Named so that "missing" is never confused with "deferred":

- No authentication, authorisation, or multi-tenancy — the brief names all three out of scope.
- No solver-grade optimality — the brief itself says none is defined; a greedy heuristic with a
  bounded rebalance is the defensible choice, not a shortcut (§D.4).
- No per-staff availability, days off, or roles/skills matching — brief stretch goals 3 and 4,
  time-boxed out; the `FeasibilityGate` already has the reason-code slot for the first of these
  (`UNAVAILABLE`, currently reused for "unknown staff/shift reference").
- No CSV export of the roster — brief stretch goal 5, not built.
- `apps/web`'s UI is intentionally partial — one real screen proving the backend wiring, not all
  seven. This collection's own priority is the backend design; see the sibling `readme.md`'s "Why
  the stack changed mid-build" for the reasoning made explicit.

## B.5 Ambiguity — where the brief didn't say

The brief explicitly invites this: *"make a reasonable decision, state your assumption briefly,
and move on."* Seventeen were logged
([full table](docs/01_business_requirements.md)). The ones that changed the design:

| Ambiguity | Assumption | Consequence |
|---|---|---|
| What is `N` (transactions per staff-hour)? Brief: *"you choose N and justify it."* | An editable parameter with a **"suggest from data"** action solving for the `N` closest to 80% capacity utilisation — seeded default 18, the value the real dataset's own calibration returns *when floor-hours are used, not raw required hours*. | A constant is arbitrary the moment the dataset changes; the calibration method is the defensible answer, not a magic number. |
| Is a manually-edited roster allowed to violate a hard constraint? Stretch goal 1 invites manual adjustment. | No. `validateRoster` replays the **same** `FeasibilityGate` the generator uses. | Two entry points, one implementation of the rules — the reason manual editing can't quietly become the hole in the guarantee. |
| Is the weekly-hours cap a hard limit or a target? | **Hard cap.** Fairness (soft) and the cap (hard) are enforced by different mechanisms — a gate rejects one, a scored pass merely prefers the other. | The brief itself distinguishes "must respect" (cap) from "should aim to" (fairness) in the same sentence; the implementation mirrors that distinction structurally, not just in prose. |
| Are the CSV's day columns positional? The real file runs Fri…Thu while a schedule is Mon–Sun. | Columns are matched by **extracting the weekday token from the label**, never by position — and the file turned out to need this: a title row, a UTF-8 BOM, an empty header cell, and a comma *inside quotes* in every day label (`"Fri, 07 Aug"`), none of which the brief's own illustrative table shows. | Reading by position would silently rotate the whole week — Friday's demand lands on Monday, and every downstream number stays plausible. The most dangerous available bug in the entire import path, because nothing about the output looks wrong. |
| Persistence: what and where? | **This changed mid-build.** The brief permits any storage; the repository first chose SQLite (no server), then reversed to PostgreSQL + Docker + a real NestJS backend — not because the brief demanded it, but because this collection's own standard does (see `readme.md`). `docs/01`'s own assumption table still describes the superseded SQLite choice; `docs/04_data_model.md`/`docs/03_architecture.md` describe what actually shipped. |

---

# C · Why it's hard

## C.1 There is no optimum, and the brief says so on purpose

Unlike scenario 01's booking problem — a binary invariant, provable — this problem has **soft
objectives that compete**: cover the busy hours, but also give everyone a useful amount of work,
from a pool of contracted hours that is almost never exactly the right size. There is no single
number to maximise. The brief states this explicitly rather than hiding it: *"there is no single
correct algorithm; we are looking for a defensible approach and clear reasoning."* That changes
what "done" means — not "passes every test" but "the reasoning survives scrutiny."

## C.2 A hard constraint that no database row can see

Three hard constraints must hold in every roster: (H1) nobody exceeds their weekly-hours cap, (H2)
nobody works two overlapping shifts the same day, (H3) nobody is double-booked into the identical
shift twice. Scenario 01's equivalent problem has a database-native answer — Postgres's `EXCLUDE
USING gist` makes two overlapping rows unrepresentable. **That trick does not extend here.** H1 is
an **aggregate over every row for one staff member across the whole week** — no row-level
constraint, on any database, can see "the sum of this person's other assignments" at insert time.
Of the three constraints, only H2 is even theoretically expressible as a database constraint, and
only on Postgres.

> **The general lesson, restated for this scenario's specific shape:** when the invariant is an
> aggregate over rows rather than a relationship between two rows, the guarantee has to live in the
> algorithm, not the schema — because the schema has nothing to check it against until the write
> already happened.

## C.3 The business consequence of getting it wrong

Not an abstract quality question. A roster that quietly overstaffs 10pm and understaffs 1pm on
Friday — the real busiest hour in the dataset used here — costs a shift's wages for no coverage
benefit, on one side, and a lost queue-frustrated customer on the other. And it is **silent**: an
overstaffed hour and an understaffed one both "work" in the sense that the app doesn't crash; only
the coverage numbers reveal which is which, which is exactly why the coverage view exists as a
stretch goal, not an afterthought.

## C.4 Difficulty · ★★★☆☆

The core insight — enforce the hard constraints through one chokepoint, and don't chase an
optimum that isn't defined — is a single design move, and once seen it's straightforward. What
earns the middle rating is the breadth of correct-but-easy-to-skip supporting work around it:
shift-quantisation-aware headcount calibration, a real CSV parser (not `split(',')`), fairness
defined precisely enough to implement, and proving all of it over generated inputs rather than a
handful of examples.

---

# D · The design

## D.1 Architecture

```
apps/web (Next.js)                apps/scheduler-api (NestJS + Fastify)
   │  fetch, via api-client.ts        │
   ▼                                  ▼
   ──────────────── HTTP ──────────── CQRS bus (CommandBus / QueryBus)
                                       │
                                       ▼
                              scheduling module (domain/application/infrastructure)
                                       │  calls into, never re-implements
                                       ▼
                    packages/scheduling-core  ⭐ zero-runtime-dependency algorithm
                                       │
                                       ▼
                              PostgreSQL (Docker)
```

Full diagram and component roles: [`docs/03_architecture.md`](docs/03_architecture.md). Two
processes, one Postgres, no message broker — this repo's own version of scenario 01's "no Redis,
no Kafka, neither has earned its place yet."

## D.2 Data model

Six tables. Why each one exists:

| Table | Why it's needed |
|---|---|
| `Schedule` | The container (2.1) — also carries the tunable algorithm parameters (`N`, `U_min`, …) |
| `StaffMember` | Name + the one hard number, `maxWeeklyHours` |
| `DemandCell` | One row per `(day, hour)` — unique on that pair, so a re-import upserts (never appends) |
| `Shift` | `label`, `startMinute`, `endMinute` — minutes-from-midnight, not `TIME`, because every consumer immediately converts to a number anyway |
| `Assignment` | One staff member, one shift, one day, tagged `AUTO`/`MANUAL` — unique on `(staffId, shiftId, dayOfWeek)`, mirroring the gate's own H3 |
| `ScheduleRun` | Provenance: which parameters produced a given auto-schedule run, and what it couldn't cover |

Full schema: [`docs/04_data_model.md`](docs/04_data_model.md).

## D.3 The flagship decision — one gate, proven by property, not by example

`packages/scheduling-core`'s `FeasibilityGate` is the only way an assignment can enter a roster —
[ADR-0001](docs/adr/0001-constraint-enforcement-strategy.md). Every write path, whether the
auto-scheduler or a manual edit, goes through it:

```typescript
const gate = new FeasibilityGate(input)
const state = new RosterState()
const verdict = gate.eligible(staffId, day, shift, state)
if (verdict.ok) state.commit(verdict.eligibility)   // the ONLY way state can change
```

`RosterState.commit()` accepts only an `Eligibility` value, and the gate is the only thing that
can construct one — there is no second code path that can push an infeasible assignment into a
roster, by construction, not by convention.

Because §C.2 established this cannot be proven by a database constraint, it is proven a different
way: **property-based testing over generated staff sets, demand grids, and shift definitions**
(`fast-check`), asserting for every generated input that (1) H1–H3 always hold and (2)
`generateRoster` never throws — an infeasible week is a diagnostics case, not an exception. This is
this scenario's direct analogue of scenario 01's real-concurrent-request integration test: the one
test that proves the actual guarantee, structurally incapable of passing by accident.

**Two callers, one gate, replayed for manual edits.** `generateRoster` calls the gate to build a
roster from nothing; `validateRoster` — the same gate, same rules — replays it against an existing
roster plus one candidate assignment for manual edits (stretch goal 1). One implementation of the
rules, never two copies drifting apart.

## D.4 The alternatives, and why each was rejected

From [ADR-0002 §4](docs/adr/0002-auto-schedule-algorithm.md) — an ADR without rejected options
isn't an ADR:

| Alternative | Rejected because |
|---|---|
| **LP/CP-SAT (e.g. OR-Tools)** | Would find a provably-optimal assignment against a defined objective — but no objective is defined by the brief (fairness and coverage trade off without a stated weighting), and it adds a solver dependency for a problem size (≤ tens of staff, 14 shift-slots) where a solver's guarantees aren't worth its cost. **Trigger to revisit:** hard constraints multiply — skills, availability, statutory rest, multi-site. |
| **Simulated annealing** | Non-deterministic by nature, or needs a threaded seed that reintroduces state the package is built to avoid; harder to explain *why* a given seat went to a given person, which matters for the brief's "clear reasoning" requirement. |
| **Pure round-robin** | Ignores utilisation entirely — the brief's fairness requirement demands measuring against each person's own cap, which round-robin structurally cannot do (a 16h/week and a 40h/week person get equal rotation weight). |
| **Exhaustive search** | Combinatorially infeasible past a handful of staff, even at the seed team's own scale (12 staff × 7 days × 2 shifts). |

The chosen design: a **three-pass deterministic greedy assignment, then a bounded local-search
rebalance** — fill the minimum-coverage floor preferring under-utilised staff, top up toward peak
coverage, then bounded-search-swap assignments between the most- and least-loaded staff while the
gate still approves and the utilisation gap strictly shrinks (hard cap 200 iterations). Full
mechanics: [ADR-0002](docs/adr/0002-auto-schedule-algorithm.md).

## D.5 Other decisions worth stealing

- **A real quoted-field CSV parser, hand-written, not `line.split(',')`.** The real demand file's
  day labels contain a comma *inside quotes* (`"Fri, 07 Aug"`) — the brief's own illustrative table
  is exactly what would lead someone to write the naive version. Columns matched by weekday
  *token*, never position, so a reordered-columns file is handled for free.
- **`N` calibrated against *floor* staff-hours, not raw required hours** — the shift-quantisation
  gap (you cannot hire someone for the 1pm hour alone) is ~20% at every value of `N`; ignoring it
  under-provisions by exactly that.
- **The coverage view recomputes live, never from a stored snapshot** — once manual editing exists,
  a cached "last auto-schedule run" answer goes stale the instant a manager adds or removes one
  assignment. Verified directly: deleting one assignment changed that hour's reported coverage on
  the very next read, no re-run required.
- **`scheduling-core` has zero runtime dependencies, lint-enforced** ([ADR-0004](docs/adr/0004-scheduling-core-as-a-pure-package.md))
  — plain data in, plain data out, no framework, no ORM, no validation library. This is what makes
  running thousands of property-test cases per commit affordable, and what let the same package
  survive a full backend-architecture rewrite (§below) completely untouched.

## D.6 Technology, and why — including a decision reversed mid-build

| Choice | Reason |
|---|---|
| **`packages/scheduling-core`, zero dependencies** | The algorithm has to be provable by property test at speed; a framework or ORM dependency would slow the suite and blur what's actually being tested. |
| **NestJS + Fastify + PostgreSQL + Docker + CQRS** | *Not the first choice.* An earlier draft argued this down to one Next.js app + SQLite — none of the brief's five grading criteria is infrastructure, so why ship a container the brief doesn't ask for? Correct locally, and overruled anyway: this collection's own standard is that a scenario ships a **real backend design**, the same way scenario 01 does. `.ai/plans/backend-architecture-reversal.plan.md` records the reversal, including the argument it overrode, rather than deleting the evidence that the simpler answer was seriously considered. |
| **CQRS + Unit of Work** (`packages/shared-kernel`, ported from scenario 01) | Makes the transaction boundary structural, not a discipline to remember — [ADR-0005](docs/adr/0005-transaction-retry-boundary.md), the one ADR in this scenario that is ported rather than original. |
| **Zod, at the controller boundary only** | One validation library, applied once — `scheduling-core` trusts its caller completely by design; the boundary that holds that trust is `apps/scheduler-api`'s job, never the algorithm's. |

---

# E · Correctness

## E.1 What must be proven

One sentence: **for any staff roster, demand grid, and shift set, the generated roster never lets
a hard constraint be violated, and the generator never crashes trying.** Everything else —
coverage quality, fairness — is measured, not proven, because no optimum is defined (§C.1).

## E.2 Three test layers, each proving what the others structurally cannot

80/80 tests in `packages/scheduling-core` alone, across layers that enter at different depths —
deliberately, the same discipline scenario 01 uses:

| Layer | Enters at | Proves | Structurally **cannot** prove |
|---|---|---|---|
| **1 ⭐ Property-based** (`fast-check`) | `generateRoster`/`validateRoster` directly, over generated inputs | For **arbitrary** staff/demand/shifts: H1–H3 always hold, the function is total (never throws), same input twice → structurally equal roster | The app is wired up correctly; the roster is *good*, not just legal |
| **2 Golden file** | Vitest snapshot on the real committed CSV | The exact roster/summary/diagnostics for one real dataset, including the brief's own illustrative arithmetic | Anything about other inputs |
| **3 Integration** | Real HTTP, real Postgres | The CSV importer against the real malformed corpus; `validateRoster` rejecting an illegal manual edit; the coverage view recomputing live | Generality — this layer only ever sees the one seeded dataset |

Layer 1 is the flagship, for the same reason scenario 01's real-concurrent-request test is: it is
the one layer that cannot be satisfied by code that merely looks correct.

## E.3 What each layer actually caught — real defects, not hypotheticals

The least flattering, and most useful, part of this document:

- Re-deriving the plan's own `N`-calibration math against the real dataset during Phase 1 found
  the plan's own arithmetic wrong: it claimed **N=18** as the calibrated answer; the actual
  calculation returns **N=15**. `18` still ships as the seeded default (a deliberate, disclosed
  choice — `suggestTransactionsPerStaff` reports 15 honestly rather than the formula being quietly
  retuned to agree with the shipped default), but the discrepancy would have gone unnoticed without
  measuring the real file instead of trusting the plan's prose.
- `apps/scheduler-api`'s own `npm test` had 3 of its 5 suites **silently failing to even load**
  since the backend was first built — a missing `.js`-extension-strip rule in its Jest config. No
  one had noticed because verification up to that point ran the compiled server + `curl`, never
  this app's own test runner directly.
- Two apps (SQLite `apps/web`, Postgres `apps/scheduler-api`) shared **one generated Prisma client
  output directory** — whichever ran `prisma generate` last silently overwrote the other's client,
  crashing the other app at boot with an unrelated-looking datasource error. Found mid-session,
  fixed, and permanently closed by deleting `apps/web`'s schema entirely once it was no longer
  needed.
- A tooling script (`scripts/sync.cjs`, the repo's own Stop-hook automation) kept a hardcoded path
  to `apps/web/prisma/` after that directory was deleted — invisible to typecheck/lint/test because
  it's a plain Node script with no compile step, caught only because a later doc-verification pass
  actually *ran* the script instead of assuming it still worked.

## E.4 What tests cannot prove

- That the tests asked the right questions — every defect above lived in code that had already
  passed its own layer's suite; each was found by actually running something (a real server, a
  real script, real HTTP), not by writing more assertions in isolation.
- Roster *quality* beyond what's explicitly measured (coverage rate, utilisation spread) — there is
  no ground truth "optimal roster" to diff against, because none is defined.
- Load behaviour under many concurrent schedules — out of scope; this is a single-user tool by the
  brief's own stated scope, and no number is invented to imply otherwise.

---

# F · Learning value

## F.1 Concepts, and where to see each one

| Concept | Where |
|---|---|
| Enforcing an invariant by construction, when no database constraint can express it | [ADR-0001](docs/adr/0001-constraint-enforcement-strategy.md), `assignment/feasibility-gate.ts` |
| Property-based testing as the proof mechanism for an algorithm, not a database | `index.prop-spec.ts`, `directives/testing_standard.md` |
| Rejecting a solver deliberately, with the trigger that would change the answer | [ADR-0002](docs/adr/0002-auto-schedule-algorithm.md) |
| A zero-runtime-dependency package as an architectural boundary, lint-enforced | [ADR-0004](docs/adr/0004-scheduling-core-as-a-pure-package.md), `eslint.config.js` |
| A real quoted-field CSV parser and why `.split(',')` is a trap | `demand-csv.parser.ts` |
| Recomputing a read live vs. trusting a cached snapshot, and when each is right | `GetCoverageHandler`'s docstring, `docs/04_data_model.md`'s corrected note |
| CQRS command/query separation, Unit of Work | `packages/shared-kernel/src/cqrs/`, [ADR-0005](docs/adr/0005-transaction-retry-boundary.md) |
| An architecture decision reversed mid-build, with the overridden argument kept, not deleted | `.ai/plans/backend-architecture-reversal.plan.md` §0 |

## F.2 Prerequisites

**Needed:** basic algorithmic thinking (greedy assignment, what a "constraint" means
computationally); TypeScript; REST. **Helpful, not required:** property-based testing, NestJS,
CQRS, Docker — each explained where it appears. **Not needed:** operations-research tooling,
distributed systems — deliberately, neither is here.

## F.3 Time

| Goal | Estimate |
|---|---|
| Understand the core idea | ~15 min (this document, §C and §D.3) |
| Read the design properly | ~1 hour (`docs/03` + ADR-0001 + ADR-0002) |
| Run it and see the guarantee hold | ~15 min (`RUN.md` → `packages/scheduling-core`'s property suite) |
| Rebuild it yourself from scratch | 1–2 days for the algorithm core; the backend service around it (what this scenario also built, on top of the brief's minimum) is closer to a week |

## F.4 The traps — where people actually get this wrong

1. **Reaching for a database constraint out of scenario-01 habit.** It doesn't transfer here — the
   weekly-hours cap is an aggregate over rows, invisible to any row-level constraint (§C.2).
2. **Chasing an optimum the brief never defined.** The brief says so explicitly; building a solver
   anyway answers a question nobody asked.
3. **`line.split(',')` on the demand CSV.** The brief's own illustrative table is exactly what leads
   here — the real file's day labels contain a comma inside quotes.
4. **Calibrating `N` against raw required hours, not floor hours.** The shift-quantisation gap is
   invisible until you measure the real dataset, not assume the brief's arithmetic is exact.
5. **A second implementation of the constraint rules for manual edits.** Two copies is exactly how
   the auto-schedule path and the manual-edit path drift apart — replay the same gate instead.
6. **Reading CSV columns by position.** Silently rotates the whole week; every downstream number
   stays plausible, which is what makes it dangerous rather than merely wrong.
7. **Trusting a cached "last run" snapshot for a view that must reflect a manual edit.** Coverage
   and summary both must recompute live once manual editing exists, or they lie the instant an edit
   happens.

## F.5 Interview relevance

Directly reusable when asked to design: **shift scheduling**, **nurse rostering**, **call-centre
workforce management**, or any *"convert a demand forecast into a staffing plan"* question.

The answer that lands is not "run a solver". It is: *"There's no defined optimum here, so the job
is to enforce the hard constraints by construction — one gate every assignment must pass through —
and prove that with property-based tests over generated inputs, because there's no database trick
that sees an aggregate-over-rows constraint the way it sees a two-row overlap. Soft objectives get
measured, not claimed optimal."* Then name the rejected alternatives and why
([§D.4](#d4-the-alternatives-and-why-each-was-rejected)).

---

# G · Evolution

## G.1 At 10× and 100×

| Scale | What breaks first | The fix, already designed |
|---|---|---|
| **10×** (hundreds of staff) | The bounded rebalance pass's 200-iteration cap may stop before converging | Raise the cap, or switch the rebalance's pair-selection to a priority queue instead of a linear scan — the algorithm's shape doesn't change, only its search budget |
| **10×** (many schedules/stores) | Nothing structural — each `Schedule` is already fully independent (own staff, shifts, demand, roster) | — |
| **100×** (skills/roles required) | `FeasibilityGate`'s H4 slot (currently reused for "unknown reference") needs a real qualification check | A `StaffSkill`/`ShiftRequiredSkill` join, mirroring scenario 01's `TechnicianServiceType` — the same shape, a different domain |
| **100×** (true multi-constraint complexity: statutory rest, per-staff availability, multi-site) | The greedy heuristic's blind spots grow faster than a solver's setup cost | This is `ADR-0002`'s own stated trigger for revisiting the LP/CP-SAT rejection |

## G.2 Deferred, with the trigger for each

Every one of these is a decision, recorded with the condition that would reverse it (full table:
[`docs/03_architecture.md`](docs/03_architecture.md)):

| Capability | Trigger |
|---|---|
| An LP/CP-SAT solver | Hard constraints multiply — skills, availability, statutory rest, multi-site |
| Roles/skills, per-staff availability | Brief stretch goals 3/4 — the gate already has the slot |
| Idempotency store | An append-only mutation appears (today: auto-schedule replaces, CSV import upserts — neither needs one) |
| Prometheus/Grafana scraping infra | An explicit request, or a debugging need a log line can't answer (`/metrics` already exposes the registry) |
| The remaining six `apps/web` UI screens | Time remaining — genuinely optional per this collection's stated priority (system design over UI completeness) |

## G.3 Extending the scenario yourself

Good exercises, roughly in order of difficulty:

1. **Per-staff availability / days off** — the gate already has the reason-code slot (`H4`); wire a
   real check instead of the current "unknown reference" reuse.
2. **A skills/roles requirement** — a shift that must include at least one supervisor. Think about
   whether this is a new hard constraint (a new `ReasonCode`) or a soft preference.
3. **Statutory rest rules** — e.g. an 11-hour gap required between two shifts on consecutive days.
   Note this is a constraint that spans *two days*, unlike the existing three.
4. **CSV export of the roster** (brief stretch goal 5) — the read side of the importer, in reverse.
5. **Multi-site rostering** — staff shared across more than one `Schedule`. This is the point where
   `ADR-0002`'s LP/CP-SAT rejection is worth revisiting for real.

---

## Where to go next

| | |
|---|---|
| **Run it** | [`RUN.md`](RUN.md) |
| **The system design document** | [`docs/03_architecture.md`](docs/03_architecture.md) |
| **The flagship decision, in full** | [`docs/adr/0001-constraint-enforcement-strategy.md`](docs/adr/0001-constraint-enforcement-strategy.md) |
| **How the AI-assisted build was directed and verified** | [`docs/12_ai_collaboration.md`](docs/12_ai_collaboration.md) |
| **Back to the collection** | [`../README.md`](../README.md) |
