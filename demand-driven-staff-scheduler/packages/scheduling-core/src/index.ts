// Public surface — frozen at init (init plan §2.3). Wired in Phase 1 (init plan §12) per
// phase-1-algorithm.plan.md's six-step build order.
//
// ⚠️ Only 4 of the exports below are what the app actually calls — generateRoster, summarise,
// suggestTransactionsPerStaff, validateRoster, all defined further down this file. Everything
// re-exported here is one STAGE of generateRoster's internal pipeline, surfaced for its own unit
// tests and for validateRoster's replay — not a second way to run the algorithm. If you're
// tracing what apps/scheduler-api calls, skip straight to those 4; if you're debugging one stage,
// find its line below.

export * from './model/types.js';

// Stage 0 — shared arithmetic every later stage needs (minutes ↔ hours, does-shift-A-overlap-B).
export { overlapMinutes, hoursTouchedBy, shiftHours, shiftsOverlap } from './model/hour-range.js';

// Stage 1 — demand → required staff per hour.
export { computeRequiredStaff } from './demand/demand-model.js';

// Stage 2 — required-per-hour → required-per-shift (floor/target).
export { computeShiftRequirements } from './requirements/shift-requirements.js';

// Stage 3a — the constraint chokepoint (H1-H3) + the mutable roster it gate-keeps. Every later
// stage commits through THIS pair, never a second one — directives/domain_modeling.md §1.
export { FeasibilityGate, RosterState, type Eligibility, type EligibilityData, type RosterContext, type Verdict } from './assignment/feasibility-gate.js';

// Stage 3b — the assignment passes: roles (seat requirements) → fairness floor → coverage top-up.
export { rolePass, fairnessPass, coveragePass } from './assignment/assigner.js';

// Stage 4 — bounded local search that improves fairness without ever dropping coverage.
export { rebalance } from './assignment/rebalancer.js';

// Stage 5 — turns the final RosterState into a report; never mutates it.
export { buildDiagnostics } from './reporting/diagnostics.js';

import { coveragePass, fairnessPass, rolePass } from './assignment/assigner.js';
import { FeasibilityGate, RosterState, type RosterContext } from './assignment/feasibility-gate.js';
import { rebalance } from './assignment/rebalancer.js';
import { computeRequiredStaff } from './demand/demand-model.js';
import { computeShiftRequirements } from './requirements/shift-requirements.js';
import { shiftHours } from './model/hour-range.js';
import { buildDiagnostics } from './reporting/diagnostics.js';
import { summarise as summariseImpl } from './reporting/summary.js';
import {
  DEFAULT_CALIBRATION_UTILISATION,
  type CalibrationOptions,
  type DemandGrid,
  type Roster,
  type SchedulingInput,
  type SchedulingParameters,
  type SchedulingResult,
  type Shift,
  type Staff,
  type SummaryReport,
  type Violation,
} from './model/types.js';

/**
 * generateRoster — the whole pipeline (init plan §7): demand → required → shift requirements →
 * role pass → fairness pass → coverage pass → bounded rebalance → diagnostics. Never throws on a
 * feasible-but-bad input (CLAUDE.md hard rule) — an infeasible week is a diagnostics case, not an
 * error (init plan §7.6, assumption 7). Deterministic: same input twice → structurally equal
 * result (init plan §2.2), because nothing downstream of this function reads a clock or a random
 * seed and every internal ordering ties-breaks on (name, id) or (day, shift.id).
 *
 * `rolePass` runs FIRST (stretch-goals plan §2a) — a role minimum is the narrowest constraint
 * (fewest eligible candidates), so filling it before fairness/coverage means a role shortfall
 * reflects genuine lack of capacity, not an artefact of fill order.
 */
export function generateRoster(input: SchedulingInput): SchedulingResult {
  const required = computeRequiredStaff(input.demand, input.parameters);
  const requirements = computeShiftRequirements(required, input.shifts);
  const gate = new FeasibilityGate(input);
  const roster: RosterContext = { gate, state: new RosterState() };

  // rolePass/fairnessPass/coveragePass mutate roster.state's underlying RosterState in place (same
  // instance throughout); rebalance is the one stage that returns a NEW RosterState, so roster is
  // rebuilt (not reassigned in place — RosterContext is readonly, per directives/domain_modeling.md
  // §1's "plain data" rule) to keep gate and state moving through the pipeline as one pair.
  rolePass(input, requirements, roster);
  fairnessPass(input, requirements, roster);
  coveragePass(input, requirements, roster);
  const rebalanced: RosterContext = { gate, state: rebalance(input, roster) };

  return {
    roster: rebalanced.state.toRoster('AUTO'),
    diagnostics: buildDiagnostics(input, required, requirements, rebalanced),
  };
}

/**
 * summarise — deliberately separate from generateRoster (init plan §2.3): must also work over a
 * manually-edited roster, so it takes a plain `Roster`, not the internal `RosterState`.
 */
export function summarise(roster: Roster, demand: DemandGrid, shifts: readonly Shift[]): SummaryReport {
  return summariseImpl(roster, demand, shifts);
}

/**
 * suggestTransactionsPerStaff — the data-driven `N` (init plan §7.2). Binary-searches^
 * (^actually a bounded linear sweep — see below) for the `N` minimising
 * `|floorStaffHours(N) - targetUtilisation × Σ maxWeeklyHours|`.
 *
 * ⚠️ **phase-1-algorithm.plan.md D1**: for the init plan §7.8 seed team against the real CSV,
 * this function returns **15**, not the **18** the init plan's prose claims and that
 * `apps/web/prisma/schema.prisma` ships as `@default(18)`. Re-deriving the rule from the committed
 * CSV shows N=15 is the true nearest match (296 floor staff-hours vs a 294.4-hour target, distance
 * 1.6); N=18 is off by 22.4 and is the plan's own math mismatch — see D1 and ADR-0003. **This is
 * not a bug**: Option A (decided by the user) keeps `18` as the shipped, hand-chosen default and
 * has this function report the data-driven answer honestly, so the divergence is visible evidence
 * rather than a formula quietly retuned to agree with its own default.
 *
 * A plain sweep, not a true binary search, because `floorStaffHours(N)` is not guaranteed strictly
 * monotonic in `N` (the `ceil` in stage 1 and the `mean` in stage 2 compose into a step function
 * that can plateau) — a sweep is correct regardless of shape; the search space is small enough
 * (bounded by the busiest single demand cell) that a sweep costs nothing measurable.
 */
export function suggestTransactionsPerStaff(
  demand: DemandGrid,
  staff: readonly Staff[],
  shifts: readonly Shift[],
  options: CalibrationOptions = {},
): number {
  const minStaffWhenOpen = options.minStaffWhenOpen ?? 1;
  const maxStaffPerHour = options.maxStaffPerHour;
  const targetUtilisation = options.targetUtilisation ?? DEFAULT_CALIBRATION_UTILISATION;
  const targetStaffHours = targetUtilisation * staff.reduce((sum, s) => sum + s.maxWeeklyHours, 0);

  const shiftHoursById = new Map(shifts.map((s) => [s.id, shiftHours(s)]));

  function floorStaffHoursAt(N: number): number {
    const params: SchedulingParameters = {
      transactionsPerStaffHour: N,
      minStaffWhenOpen,
      ...(maxStaffPerHour === undefined ? {} : { maxStaffPerHour }),
      minUtilisationTarget: 0, // not read by computeRequiredStaff/computeShiftRequirements — irrelevant here
    };
    const required = computeRequiredStaff(demand, params);
    const requirements = computeShiftRequirements(required, shifts);
    let total = 0;
    for (const byShift of requirements.values()) {
      for (const [shiftId, { floor }] of byShift) {
        total += floor * (shiftHoursById.get(shiftId) ?? 0);
      }
    }
    return total;
  }

  let maxObservedTransactions = 1;
  for (const hours of demand.values()) {
    for (const txn of hours.values()) if (txn > maxObservedTransactions) maxObservedTransactions = txn;
  }

  let bestN = 1;
  let bestDistance = Infinity;
  for (let N = 1; N <= maxObservedTransactions; N++) {
    const distance = Math.abs(floorStaffHoursAt(N) - targetStaffHours);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestN = N;
    }
  }
  return bestN;
}

/**
 * validateRoster — replays the SAME `FeasibilityGate` over a supplied roster (init plan §7.4,
 * assumption 12). One implementation of the rules, two callers (this and `generateRoster`); a
 * second copy for the manual-edit path is how the two paths drift.
 *
 * Processes `roster.assignments` in the order given, committing each one that the gate approves
 * against everything committed so far, and reporting a `Violation` for each one it does not.
 * An assignment referencing a staffId or shiftId not present in `input` is also a violation
 * (reason `UNAVAILABLE` — the frozen `ReasonCode` union has no dedicated "unknown reference" code;
 * H4 is otherwise unimplemented and unused, so this reuse is deliberate, not a collision with a
 * real H4 check).
 *
 * 2026-08-18 (stretch-goals plan §1a, D4): the prediction above stopped being safe once H4 became
 * real — a dangling reference and a real availability block are now different facts, and reusing
 * `UNAVAILABLE` for both would make a validateRoster caller unable to tell "fix your request" from
 * "this person has that day off". Split: dangling references now report `UNKNOWN_REFERENCE`.
 *
 * Deliberately UNCHANGED by roles (stretch-goals plan §2a, D5): a role minimum is a per-SEAT
 * question ("is this shift legal yet"), not a per-CANDIDATE one, and `FeasibilityGate.eligible`
 * only ever answers the latter — there is no `ReasonCode` for a role shortfall and this function
 * does not gain one. `Diagnostics.roleShortfalls` is the only surface for it. Do not "fix" this
 * omission; see ADR-0006.
 */
export function validateRoster(roster: Roster, input: SchedulingInput): Violation[] {
  const gate = new FeasibilityGate(input);
  const state = new RosterState();
  const staffIds = new Set(input.staff.map((s) => s.id));
  const shiftById = new Map(input.shifts.map((s) => [s.id, s]));
  const violations: Violation[] = [];

  for (const a of roster.assignments) {
    const shift = shiftById.get(a.shiftId);
    if (!staffIds.has(a.staffId) || !shift) {
      violations.push({ staffId: a.staffId, day: a.day, shiftId: a.shiftId, reason: 'UNKNOWN_REFERENCE' });
      continue;
    }

    const verdict = gate.eligible(a.staffId, a.day, shift, state);
    if (verdict.ok) {
      state.commit(verdict.eligibility);
    } else {
      violations.push({ staffId: a.staffId, day: a.day, shiftId: a.shiftId, reason: verdict.reason });
    }
  }

  return violations;
}
