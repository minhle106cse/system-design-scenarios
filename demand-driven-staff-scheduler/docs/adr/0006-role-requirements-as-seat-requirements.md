# ADR-0006 — Role Requirements Are a Seat Requirement, Not a Gate Constraint

**Status:** Accepted.

## Context

Brief stretch goal 4: *"add roles/skills (e.g. a shift must include at least one supervisor)"*
(`stretch-goals-availability-and-roles.plan.md` §2). The obvious first instinct, given ADR-0001's
own precedent, is to make this a fifth hard constraint (H5) inside `FeasibilityGate` — the same
chokepoint H1–H4 already go through.

That instinct is wrong for this rule specifically. `FeasibilityGate.eligible(staffId, day, shift,
state)` answers exactly one question: *"may THIS person take THIS seat, given what's committed so
far?"* A role minimum asks a structurally different question: *"is THIS SEAT legal yet, regardless
of who's in it?"* Pushing the second question into a function shaped for the first breaks three
things at once:

1. **`rebalancer.ts`'s `withoutAssignment` would start throwing.** It replays every
   previously-committed assignment through the gate on every candidate move, on the documented
   assumption that a replay of an already-valid assignment can never fail — "the gate is not
   deterministic, which should be impossible" is a thrown `Error`, not a `Violation`. Removing the
   only supervisor from a seat *while replaying the rest of that seat's roster* would trip exactly
   that throw, for a case that is not a bug — it is a Tuesday afternoon with no supervisor available.
2. **Verdicts would become order-dependent**, breaking the permutation-determinism property
   (`index.prop-spec.ts` assertion 3b — shuffling `staff`/`shifts` must not change the result set).
   A per-seat rule evaluated per-candidate necessarily depends on who else is already committed to
   that seat, which depends on iteration order — the opposite of what `FeasibilityGate.eligible`
   guarantees today (H1–H4 are all facts about one candidate, never "how many of X are already here").
3. **`Violation` has no shape for it.** `{ staffId, day, shiftId, reason }` requires a `staffId` —
   "this shift lacks a supervisor" doesn't have one. Bolting an optional `staffId` onto `Violation`
   for one reason code is a worse shape for every other caller than adding a parallel type.

## Decision

Role minimums are enforced as a **seat-filling responsibility**, not a gate rule:

- **`FeasibilityGate`/`validateRoster` are unchanged.** No new `ReasonCode`, no new case in
  `eligible`. A staff member without the required role is simply never picked for that seat by the
  assigner — the gate never has to say no, because the assigner never asks it to.
- **`rolePass`** (`assigner.ts`) runs as its own stage, **before** `fairnessPass`/`coveragePass` —
  most-constrained-first: a role minimum is the narrowest filter (fewest eligible candidates) of
  any seat-filling rule in this system, and filling the narrowest constraint first is the only
  order under which "no supervisor available" reported at the end reflects genuine lack of
  capacity rather than an artefact of which pass happened to run first.
- **`Diagnostics.roleShortfalls`** is the sole reporting surface — a new, required array field,
  never a thrown error (assumption 20, consistent with CLAUDE.md's hard rule that `generateRoster`/
  `validateRoster` never throw on a feasible-but-bad input).
- **`rebalancer.ts` gets a second acceptance condition**, `roleCoverageDidNotFall`, alongside the
  existing `coverageDidNotFall` — a move is only accepted if it doesn't reduce the number of
  role-holders on any (day, shift, role) below what it was before. `coverageDidNotFall` alone would
  let rebalance swap a shift's only supervisor for a non-supervisor purely to shrink the fairness
  gap, silently destroying role coverage `rolePass` had already secured.

## Alternatives considered

| Alternative | Rejected because |
|---|---|
| A fifth gate constraint (H5) evaluated per-candidate in `eligible` | Breaks `rebalancer.ts`'s no-throw replay assumption, breaks permutation-determinism, and has no `Violation` shape that fits — see Context above |
| A post-hoc validation pass after `generateRoster` returns, rejecting a roster with any unfilled role | Contradicts D3 and the brief's own "surface the outcome... rather than failing silently" (assumption 7) — a role shortfall must be reported, not block the whole draft |
| Store `roleRequirements` as a fact `validateRoster` also checks (mirroring H1–H4's structure) | Same shape problem as the gate option, one layer up — `validateRoster`'s `Violation[]` return still has no per-seat (no-staffId) case, and D5 already establishes the gate/validateRoster pair is the wrong tool for a seat-level question |

## Consequences

- Adding this pass changes `generateRoster`'s pipeline from `fairnessPass → coveragePass →
  rebalance` to `rolePass → fairnessPass → coveragePass → rebalance` — `index.ts`'s docstring
  updated in the same change, not left describing three stages when there are now four.
- A role-holder can be pushed above `U_min` (the fairness target) before `fairnessPass` even runs,
  since `rolePass` commits first and its commits count toward `state.hours`/`utilisationOf` for
  every later pass. `rebalance`'s normal fairness-improving moves can still un-concentrate some of
  that — just never at the cost of a seat's role coverage, per `roleCoverageDidNotFall` above.
- `packages/scheduling-core` still has zero runtime dependencies (ADR-0004) — this entire decision
  is expressible with the existing `Staff.roles?`/`Shift.roleRequirements?` optional fields and one
  new pass function; no new package, no new external constraint solver.
