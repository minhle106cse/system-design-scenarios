# ADR-0002 — Auto-Schedule Algorithm

**Status:** Accepted.

## Context

The brief (§4) asks for: demand → required headcount per hour, headcount mapped onto shifts
covering the busiest hours within each shift, staff assigned respecting weekly-hours caps, and load
balanced so *"nobody scheduled for zero or near-zero hours while others are maxed out."* It states
explicitly: *"There is no single correct algorithm; we are looking for a defensible approach and
clear reasoning."*

The measured real data (plan §7.1) shows the demand variance is almost entirely **within** a day
(7am/10pm troughs against a 1pm peak), not across days — so the interesting problem is mapping
demand onto shifts, not distributing load across the week.

## Decision

A **three-pass deterministic greedy assignment, followed by a bounded local-search rebalance**:

1. **Fairness pass** — walk the `floor` seats (stage 2's minimum-coverage headcount per
   `(day, shift)`), preferring eligible staff below the minimum utilisation target `U_min` (default
   60%, ADR-0003's sibling decision — plan §7.5), lowest utilisation first.
2. **Coverage pass** — fill remaining `floor` seats, then top up toward `target` (full peak
   coverage), largest uncovered peak first, always the lowest-utilisation eligible candidate.
3. **Rebalance pass** — bounded local search: take the (most-loaded, least-loaded) staff pair and
   try moving one assignment between them. Accept only if `FeasibilityGate` approves, coverage does
   not fall, and the max−min utilisation gap strictly shrinks. Hard cap 200 iterations; terminates
   early when no improving move exists.

Ties are broken by `(name, id)` — never insertion order, never random — so `generateRoster` is
deterministic (plan §2.2, required for the golden-file test layer).

Complexity: `O(days × shifts × staff)` per pass, plus the bounded search — sub-millisecond at this
scale, which is what makes running thousands of property-test cases per commit affordable
(`directives/testing_standard.md`).

## Alternatives considered

| Alternative | Rejected because |
|---|---|
| LP/CP-SAT (e.g. OR-Tools) | Would find a provably-optimal assignment against a defined objective — but no objective is defined by the brief (fairness and coverage trade off against each other without a stated weighting), and it adds a solver dependency (violates `scheduling-core`'s zero-dependency rule, ADR-0004) for a problem size (≤ tens of staff, 7×2 shift slots) where a solver's guarantees aren't worth its cost. **Trigger to revisit:** hard constraints multiply — skills matrix, per-staff availability, statutory rest rules, multi-site — at which point a greedy heuristic's blind spots grow faster than a solver's setup cost |
| Simulated annealing | Non-deterministic by nature (or needs a fixed seed threaded through the whole package, which reintroduces state `scheduling-core` is built to avoid — plan §2.2); harder to reason about *why* a given seat went to a given person, which matters for the brief's "clear reasoning" criterion |
| Pure round-robin | Ignores utilisation entirely — the brief's fairness requirement ("apply it consistently") demands measuring against each person's own cap, which round-robin structurally cannot do (a 16h/week and a 40h/week person get the same rotation weight) |
| Exhaustive search | Combinatorially infeasible even at seed-team scale (12 staff × 7 days × 2 shifts) the moment staff count grows past a handful |

## Consequences

- The fairness definition (`U_min`, plan §7.5, assumption 5) is load-bearing for pass 1's ordering
  — changing it changes who gets seats first, not just a report label.
- Because rebalancing is bounded and greedy, the algorithm does not claim optimality — see
  `docs/08_testing_strategy.md`'s "on quality, honestly" section for what is measured instead.
