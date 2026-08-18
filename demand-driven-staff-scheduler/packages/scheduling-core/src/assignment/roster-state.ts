// The mutable accumulator half of the gate pair — split out of feasibility-gate.ts so it can be
// read (and reused for reporting/replay) without pulling in the H1-H3 rule logic. `directives/
// domain_modeling.md` §1: `FeasibilityGate`/`RosterState` are deliberately the ONLY mutable classes
// in this package — do not add a second one.
import { dataOf, type Eligibility, type EligibilityData } from './eligibility-brand.js';
import { shiftHours } from '../model/hour-range.js';
import type { DayOfWeek, Roster, ShiftId, StaffId } from '../model/types.js';

/**
 * The only mutable structure in `scheduling-core` (`directives/domain_modeling.md` §1). Exposes
 * exactly one mutator, `commit`, which only accepts an `Eligibility` — so no code path can add an
 * assignment without first going through `FeasibilityGate.eligible`.
 */
export class RosterState {
  private readonly committed: Eligibility[] = [];

  /** Total assigned hours for a staff member across every day committed so far. */
  hours(staffId: StaffId): number {
    let total = 0;
    for (const e of this.committed) {
      const data = dataOf(e);
      if (data.staffId === staffId) total += shiftHours(data.shift);
    }
    return total;
  }

  /** This staff member's assignments on one day — what H2/H3 check against. */
  assignmentsOn(staffId: StaffId, day: DayOfWeek): readonly EligibilityData[] {
    return this.committed.map(dataOf).filter((d) => d.staffId === staffId && d.day === day);
  }

  /** This staff member's assignments across every day — what the rebalance pass moves. */
  assignmentsFor(staffId: StaffId): readonly EligibilityData[] {
    return this.committed.map(dataOf).filter((d) => d.staffId === staffId);
  }

  /** Every committed assignment. Used to replay a state minus one entry (rebalancer.ts) and by
   *  reporting (diagnostics.ts, summary.ts) — never to mutate; only `commit` mutates. */
  all(): readonly EligibilityData[] {
    return this.committed.map(dataOf);
  }

  /** How many staff are currently assigned to this exact (day, shift) — what coverage checks read. */
  countOn(day: DayOfWeek, shiftId: ShiftId): number {
    let count = 0;
    for (const e of this.committed) {
      const d = dataOf(e);
      if (d.day === day && d.shift.id === shiftId) count++;
    }
    return count;
  }

  commit(eligibility: Eligibility): void {
    this.committed.push(eligibility);
  }

  toRoster(source: 'AUTO' | 'MANUAL' = 'AUTO'): Roster {
    return {
      assignments: this.committed.map(dataOf).map((d) => ({
        staffId: d.staffId,
        shiftId: d.shift.id,
        day: d.day,
        source,
      })),
    };
  }
}
