# Business Requirements — Staff Scheduling System

> Quoted from [`SWE_Take-Home_Staff_Scheduling_System.pdf`](../SWE_Take-Home_Staff_Scheduling_System.pdf),
> the brief this repository implements, with assumptions logged separately below as that brief
> requires: *"Where a requirement leaves room for interpretation, make a reasonable decision, state
> your assumption briefly, and move on."*

**Task:** build a web application that helps a store manager plan weekly staff schedules from
historical demand.

## Core requirements

| § | Requirement |
|---|---|
| **2.1** | **Create a schedule.** The top-level container for staff, transactions, shifts and the generated roster. One typical week, organised by day of week (Monday–Sunday) and by hour. |
| **2.2** | **Add staff and their maximum weekly hours.** At minimum a name and a maximum number of work hours per week. Add, edit, remove. |
| **2.3** | **Upload transaction (demand) data.** A transaction count for each hour of each day of the week, imported from the provided CSV. The count is a proxy for how busy the store is. |
| **2.4** | **Define shifts.** A shift is defined by **only a start time and an end time**. Seed two defaults: 07:00–15:00 and 15:00–23:00. Add, edit, remove. |
| **2.5** | **Auto-schedule.** One button drafts a sensible weekly schedule: busier hours covered by more staff, every staff member's maximum weekly hours respected, and *"a fair, useful amount of work — nobody scheduled for zero or near-zero hours while others are maxed out."* The result is a **draft** the user can see and adjust. |
| **2.6** | **Aggregated summary view.** Per day-of-week and hour: transactions, staff hours, transactions per staff hour (guarding division by zero). Plus four week-level aggregations — total staff hours, total transactions, transactions per staff hour (overall), and the average of the per-cell ratios. *"Note this can differ from the overall figure above; show both."* |

## Auto-schedule expectations (§4 of the brief)

*"This is the heart of the exercise. There is no single correct algorithm; we are looking for a
defensible approach and clear reasoning."* The brief's suggested line of thinking:

1. Estimate demand per hour — convert transaction counts into a required number of staff, *"one staff
   member per N transactions per hour, with a sensible minimum (such as one) … You choose N and
   justify it."*
2. Map demand onto shifts — how many people each shift needs each day so the busiest hours within
   that shift are adequately covered.
3. Assign staff to shifts, respecting every maximum weekly hours.
4. Balance the load — *"Define what 'enough hours' means … and apply it consistently."*

*"Trade-offs are expected. Demand may exceed available staff hours, or vice versa. Handle these cases
gracefully … and surface the outcome to the user rather than failing silently."*

## Technical requirements (§5)

- **UI is required** — not a command-line or API-only exercise.
- Stack is the candidate's choice; persistence may be in-memory, local storage, or a database.
- **Keep it runnable** — *"Prefer a one- or two-command setup."*
- **Scope sensibly** — *"Favour a clean, working end-to-end flow over half-finished breadth.
  Authentication, multi-user support, and deployment are explicitly out of scope."*
- Suggested effort roughly 4–6 hours; *"Do not gold-plate."*

## Explicitly out of scope

Authentication · multi-user support · deployment. Named by the brief, not inferred.

## Stretch goals (§8, optional)

Manual/drag-and-drop adjustment after auto-scheduling · a coverage view (required vs scheduled per
hour) · per-staff availability or days off · roles/skills (e.g. a shift must include at least one
supervisor) · export the roster.

---

## Assumptions

Ambiguities in the brief and the reasonable decision made for each. The brief asks for exactly this,
and this is the document where they live. Anything here that changes the schema or the algorithm is
cross-referenced to the plan section that acts on it.

| # | Ambiguity | Assumption made | Why |
|---|---|---|---|
| 1 | **What is `N`** — the transactions-per-staff-hour rate that converts demand into headcount? The brief says *"You choose N and justify it."* | `N` is a **per-schedule editable parameter**, not a hard-coded constant, with a **"Suggest from data"** action that solves for the `N` at which *floor* staff-hours ≈ **80%** of total contracted hours. Seeded default **`N` = 18**, the value that calibration returns for the real sample dataset against the seeded team. | A constant is arbitrary the moment the dataset changes; defending a magic number is weaker than defending a method. Two refinements the measured data forced (plan §7.2): calibrate against **floor** hours, not raw required hours — the shift-quantisation gap is ~20% and ignoring it under-provisions by exactly that; and calibrate to **80% of capacity, not 100%** — a contracted maximum is a cap, not a quota. Calibration also *is* the diagnosis the brief asks for in §4 (*"demand may exceed available staff hours, or vice versa"*). ADR-0003. |
| 2 | **When is the store open?** There is no opening-hours concept in the brief. | An hour is open **iff the imported demand data has a cell for it**. The sample covers 07:00–23:00. No separate opening-hours model. | The demand file already carries the information. A second source of truth for "open" would immediately contradict the first the moment a file covered different hours. Plan §7.2. |
| 3 | **Can a shift run overnight** (e.g. 22:00–02:00)? | **No — rejected in v1.** `endMinute > startMinute` is enforced by the Zod schema on every write path, and asserted as a precondition in `scheduling-core`. | Both seeded shifts and all sample data fit inside one day. Overnight shifts spill staff-hours into the *next* day's cells, which changes the summary table's aggregation, not just the shift record. Deferring is cheap; getting it half-right is not. **Trigger:** a 24-hour venue. Plan §3.3. |
| 4 | **Must shifts align to whole clock hours?** The brief's summary table says a cell *"equals the number of staff on shift during that hour (each contributes one staff-hour)"*, which assumes they do. | Shifts may start and end at any minute. Staff-hours are computed as `overlap(shift, hour) ÷ 60`. | The general formula **reduces to** the brief's statement for whole-hour shifts, so nothing about the stated case changes — but a 07:30 shift produces correct arithmetic instead of a rounding decision nobody wrote down. Costs nothing. Plan §7.7. |
| 5 | **What does "fair" mean?** The brief requires it and explicitly delegates the definition. | A **minimum utilisation target** `U_min`, default **60%**: every staff member should reach at least `U_min × maxWeeklyHours`, **if total demand permits**. Fairness is measured on the utilisation *ratio*, not on absolute hours. | Absolute equality is wrong when staff have different contracts — giving a 10 h/week student and a 40 h/week supervisor the same 20 hours is unfair to both. The ratio is the comparable quantity. The "if demand permits" clause is load-bearing: when it does not, the diagnostics say so rather than the algorithm pretending. Plan §7.5, ADR-0002. |
| 6 | **Peak or average coverage within a shift?** *"…so that the busiest hours within that shift are adequately covered"* — the peak hour and the quiet hour of one shift need different headcounts, but staff are assigned to the whole shift. | Two targets per (day, shift): a **floor** = `ceil(mean(required))` filled first for every shift, then a **top-up** toward **target** = `max(required)`, largest uncovered peak first, until capacity runs out. | Covering every peak overstaffs every trough and burns contracted hours a busier day needed more. Covering the mean leaves peaks short. The floor-then-top-up order makes capacity, not the target, decide where it stops — and makes the stopping point reportable. Plan §7.3, ADR-0003. |
| 7 | **What happens when demand exceeds capacity, or capacity exceeds demand?** The brief requires graceful handling but does not say what the system should do. | Neither is an error. The roster is generated to whatever extent is feasible, and **every** shortfall is reported: per-hour understaffing, per-staff under-target, a reason code for every seat that could not be filled, and one structural verdict comparing total required staff-hours to total contracted hours. | *"Surface the outcome to the user rather than failing silently"* is the brief's own instruction, stated twice. A generator that throws on an infeasible week is useless precisely when the manager most needs to see the numbers. Plan §7.6. |
| 8 | **Are the CSV's day columns positional or named?** The sample runs **Fri…Thu** (07–13 Aug 2026) while a schedule is Monday–Sunday, and the brief says to *"treat the columns generically as days of the week"* and tolerate *"a different week label or ordering"*. | Columns are matched by **extracting the weekday token from the label**, case-insensitively, accepting `Fri`, `Friday` and the real file's compound `"Fri, 07 Aug"`. Position is never used. | Reading by position silently rotates the entire week — Friday's demand lands on Monday, and every number downstream is still plausible. This is the most dangerous available bug in the import path, because nothing about the output looks wrong. A reordered-columns file is in the test corpus. Plan §4. |
| 9 | **What should a malformed CSV do?** | Return a structured result — `{ cells, warnings, errors }` — with row/column-precise messages. **Never** a bare failure or a thrown error reaching the client. A missing day is a warning plus a grid with gaps; a non-numeric cell is a located error. | *"Fail gracefully on malformed input"* is explicit. A manager who exported the wrong file needs to be told which row is wrong, not that something went wrong. Plan §4. |
| 9a | **The real file does not match the brief's description of it.** The brief shows a clean `Hour \| Fri \| Sat \| …` table. The actual file has a **title row** before the header, a **UTF-8 BOM**, an **empty first header cell** (not `Hour`), and day labels of the form `"Fri, 07 Aug"` — **containing a comma inside quotes**. | Parse with a real quoted-field CSV reader; detect the header as *the first row whose remaining cells parse as day labels* rather than by index; strip the BOM; accept the brief's idealised layout too. | Found by opening the file, not by reading about it. `line.split(',')` shreds the 8-column header into 15 fields — and the brief's own table is exactly what would lead someone to write that. The idealised layout is in the test corpus alongside the real one, because the importer must accept both. Plan §4. |
| 10 | **Is re-importing a CSV additive or a replacement?** | A **replacement** — upsert on `(schedule, dayOfWeek, hour)`. Uploading the same file twice yields the same grid. | The alternative silently doubles every transaction count, and the resulting roster looks merely "busier" rather than broken. |
| 11 | **Is auto-schedule additive or a replacement?** | A **full replace** of the draft. Running it twice yields the same roster. | Makes the endpoint idempotent by construction, which is why no idempotency store is needed anywhere in this API (plan §1) — a decision worth stating, since its absence would otherwise read as an oversight. |
| 12 | **Can a manually-edited roster violate a hard constraint?** The brief's first stretch goal invites manual adjustment. | No. The same `FeasibilityGate` is replayed over user edits via `validateRoster`. | The generator is protected by its own gate; the manual path is exactly where a human creates an overlap. Two paths, **one implementation of the rules** — a second copy for the manual path is how the two drift. Plan §7.4, ADR-0001. |
| 13 | **Is a staff member's maximum weekly hours a hard cap or a target?** | A **hard cap**. It is the one number the brief states must be respected. | *"The draft **must** respect each staff member's maximum weekly hours"* — "must", against "should aim to" for fairness in the same sentence. The brief distinguishes them; so does the implementation: one is a hard constraint enforced by a gate, the other is a scored objective. |
| 14 | **Multi-user, auth, deployment?** | Out of scope — stated by the brief, not inferred. No accounts, no permissions, no tenancy. Anyone with the app can edit any schedule. | Named explicitly in §5 of the brief. Recorded here so the absence reads as compliance rather than omission. |
| 15 | **Persistence: database or browser storage?** The brief permits in-memory, local storage or a database. | **SQLite via Prisma** (`file:./dev.db`). A real schema and real migrations; no database *server*, no Docker, no ports. | A modelled schema is worth showing — it is where assumptions 3, 10 and 11 become enforceable. A database *server* is not: the app is single-user and single-process by the brief's own scope, and every container a reviewer has to start is charged against *"prefer a one- or two-command setup."* Plan §0.0 records the reversal from an earlier PostgreSQL + Docker decision, and §0.1 why the argument got **stronger** without it. |
| 16 | **Where do the hard constraints get enforced?** | In the algorithm, through a single `FeasibilityGate` that is the only way an assignment can enter a roster — proven by property-based testing over generated inputs, not by examples. | Of the three hard constraints, the weekly-hours cap is an **aggregate over rows**, which no row-level database constraint can see; only the same-day overlap rule could live in a database, and only on PostgreSQL. Enforcing one of three below the application — at the cost of a server, a hand-written migration and a denormalised column — buys less than it costs when the gate already enforces all three. Plan §0.1, ADR-0001. |
| 17 | **What shape is "per-staff availability or days off" (§8 stretch)?** | Availability is a **time window** — `{ day, startMinute, endMinute }` — not a day-level flag. "Day off" is a UI preset writing `{0, 1440}`. | Covers both halves of the brief's *"availability **or** days off"* in one model, and reuses `shiftsOverlap` verbatim (`hour-range.ts`) instead of a second overlap function for a day-flag shape. `stretch-goals-availability-and-roles.plan.md` D1. |
| 18 | **How does H4 interact with H1–H3's pinned precedence?** | **H4 is checked first** (`H4 → H3 → H2 → H1`). It is a pure function of `(staff, day, shift)` — it never reads `RosterState` — so moving it to the front cannot make a verdict depend on replay order, the invariant `rebalancer.ts` relies on. | H1–H3 are roster-relative facts a manager can fix by moving assignments around; H4 is a fact about the person no roster edit changes, so it is the more actionable diagnostic to report first. `feasibility-gate.ts`, stretch-goals plan §1a. |
| 19 | **What shape is "roles/skills, e.g. a shift must include at least one supervisor" (§8 stretch)?** | Roles are **many-to-many** — a `Role` entity, a `StaffRole` join, and a `ShiftRoleRequirement` (shift × role × minCount). | "Roles/**skills**" means a person can hold more than one (Supervisor *and* Barista) — a single `role` column on `StaffMember` cannot express that. Costs four tables, matching the brief's own example. Stretch-goals plan D2. |
| 20 | **Does a missing role requirement (e.g. no supervisor available) block the roster?** | **No — reported, never blocking.** Auto-schedule fills role seats first so it only produces a role shortfall when capacity genuinely can't cover it; `Diagnostics.roleShortfalls` says so. A role requirement applies to every day the shift runs, not per-day. | Consistent with assumption 7 and CLAUDE.md's hard rule that `generateRoster`/`validateRoster` never throw on a feasible-but-bad input. `FeasibilityGate.eligible` answers "may THIS person take THIS seat", not "is this seat legal yet" — a role minimum is a seat-count question, not a per-candidate one, so it stays out of the gate (new ADR-0006). Stretch-goals plan D3, D5. |

---

*Assumptions are added to this table as they are hit, not recalled at the end. A decision made
during implementation and written down a week later is a reconstruction.*
