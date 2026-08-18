// Stage 4 — the rebalancer (init plan §7.5, ADR-0002). Bounded local search over the roster the
// assigner produced. RosterState still exposes only `commit` as a mutator — "moving" an
// assignment is implemented by replaying every OTHER assignment through the gate into a fresh
// RosterState, then committing the new one. No hidden second mutator is added.
import { FeasibilityGate, RosterState, type EligibilityData, type RosterContext } from './feasibility-gate.js';
import { compareByNameThenId, utilisationOf } from './utilisation.js';
import type { SchedulingInput, Staff } from '../model/types.js';

const DEFAULT_MAX_ITERATIONS = 200;

function maxMinGap(staff: readonly Staff[], state: RosterState): number {
  if (staff.length === 0) return 0;
  let min = Infinity;
  let max = -Infinity;
  for (const s of staff) {
    const u = utilisationOf(s, state);
    if (u < min) min = u;
    if (u > max) max = u;
  }
  return max - min;
}

function seatCounts(state: RosterState): Map<string, number> {
  const counts = new Map<string, number>();
  for (const d of state.all()) {
    const key = `${d.day}:${d.shift.id}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/** True iff no (day, shift) seat has FEWER people covering it than `before` did. */
function coverageDidNotFall(before: RosterState, after: RosterState): boolean {
  const beforeCounts = seatCounts(before);
  const afterCounts = seatCounts(after);
  for (const [key, count] of beforeCounts) {
    if ((afterCounts.get(key) ?? 0) < count) return false;
  }
  return true;
}

/** A fresh RosterState with every committed assignment EXCEPT `excluded`, replayed through the
 *  gate (each replay is a no-op verdict since it was valid before — throws if that ever isn't
 *  true, which would mean the gate itself is non-deterministic). */
function withoutAssignment(state: RosterState, excluded: EligibilityData, gate: FeasibilityGate): RosterState {
  const next = new RosterState();
  for (const d of state.all()) {
    if (d === excluded) continue;
    const verdict = gate.eligible(d.staffId, d.day, d.shift, next);
    if (!verdict.ok) {
      throw new Error(
        `rebalancer: replaying a previously-committed assignment became infeasible (${verdict.reason}) — the gate is not deterministic, which should be impossible.`,
      );
    }
    next.commit(verdict.eligibility);
  }
  return next;
}

/**
 * Take the (most-loaded, least-loaded) pair and try moving one of most's assignments to least.
 * Accept only if: the gate approves the move for `least` **and** coverage does not fall anywhere
 * **and** the max−min utilisation gap strictly shrinks. Hard cap `maxIterations`; terminates early
 * the moment no improving move exists across every pair.
 *
 * Every candidate pair (not just the single most/least extremes) is tried each iteration, ordered
 * by utilisation gap descending, so a blocked extreme pair doesn't stop a smaller but still-
 * improving move elsewhere from being found.
 */
export function rebalance(
  input: SchedulingInput,
  roster: RosterContext,
  maxIterations: number = DEFAULT_MAX_ITERATIONS,
): RosterState {
  const { gate } = roster;
  let state = roster.state;

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    const ranked = [...input.staff].sort(
      (a, b) => utilisationOf(b, state) - utilisationOf(a, state) || compareByNameThenId(a, b),
    ); // most-loaded first

    const currentGap = maxMinGap(input.staff, state);
    let improved: RosterState | null = null;

    outer: for (let mi = 0; mi < ranked.length && !improved; mi++) {
      const most = ranked[mi]!;
      const mostUtilisation = utilisationOf(most, state);

      for (let li = ranked.length - 1; li > mi; li--) {
        const least = ranked[li]!;
        if (utilisationOf(least, state) >= mostUtilisation) break; // ranked descending — no gap left to close

        const candidates = [...state.assignmentsFor(most.id)].sort((a, b) => {
          if (a.day !== b.day) return a.day - b.day;
          return a.shift.id < b.shift.id ? -1 : a.shift.id > b.shift.id ? 1 : 0;
        });

        for (const assignment of candidates) {
          const withoutIt = withoutAssignment(state, assignment, gate);
          const verdict = gate.eligible(least.id, assignment.day, assignment.shift, withoutIt);
          if (!verdict.ok) continue;

          withoutIt.commit(verdict.eligibility);

          if (!coverageDidNotFall(state, withoutIt)) continue;
          if (maxMinGap(input.staff, withoutIt) >= currentGap) continue; // must strictly shrink

          improved = withoutIt;
          break outer;
        }
      }
    }

    if (!improved) break; // no improving move exists anywhere — terminate early
    state = improved;
  }

  return state;
}
