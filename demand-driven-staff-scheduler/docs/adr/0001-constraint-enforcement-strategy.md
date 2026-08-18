# ADR-0001 — Constraint Enforcement Strategy

**Status:** Accepted — flagship decision of this scenario.

## Context

Three hard constraints must never be violated by a generated or manually-edited roster:

- **H1** — no staff member exceeds their contracted weekly hours.
- **H2** — no staff member works two overlapping shifts on the same day.
- **H3** — no staff member is assigned the same `(day, shift)` twice.

  **2026-08-18 — a fourth joined this list**, per the Consequences section's own prediction below:
  **H4** — no staff member is assigned a shift overlapping their declared unavailability. Not
  rewritten into the sentence above (an accepted ADR's body is annotated, not edited) — see the
  Consequences section for what actually shipped.

Scenario 01 pushed its own correctness guarantee (no two overlapping appointments) into a
PostgreSQL `EXCLUDE USING gist` constraint, making the bad state unrepresentable at the database
layer. That move is not available here for any of the three constraints:

- H1 is an **aggregate over rows** — the sum of a staff member's assigned hours across the week.
  No row-level database constraint can see an aggregate at insert time.
- H2 *could* be expressed as a row-level exclusion constraint, but only on PostgreSQL, and it would
  cover exactly one of three rules — at the cost of a database server, a hand-written migration,
  and a denormalised time-range column, for a system that is otherwise single-user, single-process
  (out of scope per the brief).
- H3 could be a unique index (and is — see `docs/04_data_model.md`), but a unique index alone
  doesn't explain *why* an insert was rejected, and doesn't cover H1/H2 either.
- "The roster the generator invented respects all three, for any input" is a property of an
  **algorithm**, not of a row — no database constraint can prove it holds *before* an insert is
  attempted.

## Decision

The guarantee lives in the algorithm, enforced **by construction**:

- A single `FeasibilityGate` (`packages/scheduling-core/src/assignment/feasibility-gate.ts`) is the
  **only** way an assignment can enter a `RosterState`. `RosterState` exposes exactly one mutator,
  `commit(eligibility: Eligibility)`, and `Eligibility` is a nominal type that only the gate can
  construct. No code path — present or future, generator or manual-edit — can add an assignment
  without a gate verdict.
- `validateRoster` (the public surface's fourth function) replays the **same gate** over a
  user-edited roster, so the manual-edit path (brief stretch goal 1 — exactly where a human would
  create an overlap) answers to one implementation of the rules, not a second copy that can drift.
- Because the guarantee moved from "unrepresentable in the schema" to "unrepresentable in the
  algorithm's type system", the **method of proof** moves with it: a hand-picked example proves the
  algorithm worked once; **property-based testing** (fast-check, `*.prop-spec.ts`) proves the
  invariant holds across generated inputs, including the deliberately degenerate ones (zero staff,
  `maxWeeklyHours = 0`, overlapping shift definitions, etc. — `directives/testing_standard.md` §2).

## Alternatives considered

| Alternative | Rejected because |
|---|---|
| Post-hoc validate-then-reject (generate freely, check afterward) | The bug window exists between generation and validation; "prevent" and "detect after the fact" are not the same guarantee, and a generator that can produce an invalid roster has already failed the brief's "must respect" language |
| A DB trigger computing the weekly-hours aggregate per insert | Portable to any DB is false (trigger syntax is DB-specific); still needs a server; moves the check to write time in the *database*, not the *application*, when the application is what the brief is grading |
| PostgreSQL `EXCLUDE` for the overlap rule only (H2) | Covers one of three constraints at the full cost (server + Docker + migration) of covering none, given H1 can never be expressed this way regardless |
| Example-based tests alone, no property-based layer | Proves the algorithm worked on the examples chosen; says nothing about the input space. A property test over tame inputs is worse than none — it reads as coverage it doesn't have (`directives/testing_standard.md` §2.2) |

## Consequences

- `scheduling-core` must stay free of any dependency that could smuggle in a second way to build a
  `RosterState` (Prisma, a second copy of the model) — enforced by the zero-dependency rule,
  ADR-0004.
- Adding a fourth hard constraint (e.g. H4 — per-staff availability, brief stretch goal 4) means
  adding a case to the gate and a reason code, not a new subsystem — the slot already exists
  (`ReasonCode` union, `model/types.ts`).

  **2026-08-18 — this prediction held.** H4 was built (`stretch-goals-availability-and-roles.plan.md`
  §1): one case in `FeasibilityGate.eligible` (checked first, ahead of H1–H3 — it is a pure function
  of `(staff, day, shift)`, not `RosterState`, so it cannot affect replay-order determinism), no new
  subsystem, no change to `validateRoster`'s shape. The one thing this note didn't anticipate:
  `UNAVAILABLE` had been quietly doing double duty as `validateRoster`'s "unknown staffId/shiftId"
  code, safe only because H4 was unimplemented — that reuse had to be split into a second code,
  `UNKNOWN_REFERENCE`, once H4 became real (D4). See `docs/06_api_contracts.md`'s Roster section.
