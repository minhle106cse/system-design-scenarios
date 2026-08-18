// Stage 3a — the FeasibilityGate (init plan §7.4, ADR-0001). ⭐ The chokepoint the whole
// constraint-enforcement argument rests on: this is the ONLY way an assignment can enter a
// RosterState. Build/read this file before assigner.ts or rebalancer.ts.
import { shiftHours, shiftsOverlap } from '../model/hour-range.js';
import type { DayOfWeek, ReasonCode, Roster, SchedulingInput, Shift, ShiftId, Staff, StaffId } from '../model/types.js';

// A `unique symbol`, not `declare`d — this needs a REAL runtime value, because Eligibility objects
// are constructed with this exact key at runtime, not just typed with it. Not exported: no code
// outside this module can write the symbol literal needed to satisfy Eligibility's shape.
//
// ⚠️ The data lives NESTED inside the symbol-keyed property (`EligibilityData`), not spread as
// top-level fields alongside the brand. A first version put staffId/day/shift at the top level
// next to the brand — and `{ staffId, day, shift } as Eligibility` (no `unknown` bridge) compiled
// anyway: TypeScript's `as` allows X-as-Y whenever X is assignable to Y *or* Y is assignable to X,
// and a branded interface is always a structural subtype of its own unbranded fields, so "Y (the
// branded type) assignable to X (the plain shape)" trivially held regardless of the brand. Nesting
// everything behind the symbol means Eligibility's only top-level member is the private symbol —
// a plain `{staffId, day, shift}` shape shares NO top-level property with it in either direction,
// so neither an object literal nor a same-shape `as Eligibility` cast type-checks. Only
// `as unknown as Eligibility` still can, which is TypeScript's universal escape hatch and a
// visibly deliberate act, not an accident (phase-1-algorithm.plan.md §2.3, and the correction
// logged to .ai/memory/gotchas.jsonl after the first version was caught by its own test).
const ELIGIBILITY_BRAND: unique symbol = Symbol('Eligibility');

/** The data behind an `Eligibility` verdict, readable via `RosterState`'s query methods. */
export interface EligibilityData {
  readonly staffId: StaffId;
  readonly day: DayOfWeek;
  readonly shift: Shift;
}

/**
 * A verdict the gate approved. Nominally typed — see the module comment above. Opaque from
 * outside this module: read its data with `dataOf`, which only this file can call meaningfully
 * (it's exported only for `RosterState`, defined below in the same module).
 */
export interface Eligibility {
  readonly [ELIGIBILITY_BRAND]: EligibilityData;
}

function eligibilityOf(data: EligibilityData): Eligibility {
  return { [ELIGIBILITY_BRAND]: data };
}

function dataOf(eligibility: Eligibility): EligibilityData {
  return eligibility[ELIGIBILITY_BRAND];
}

export type Verdict = { readonly ok: true; readonly eligibility: Eligibility } | { readonly ok: false; readonly reason: ReasonCode };

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

/**
 * H1–H4 (init plan §7.4). **Evaluation order is load-bearing and pinned: H3 → H2 → H1.**
 * `ALREADY_ASSIGNED` is checked before `OVERLAPS_EXISTING_SHIFT` because a shift trivially
 * overlaps itself — reporting "overlaps" for an exact duplicate would be a misleading diagnostic.
 */
export class FeasibilityGate {
  private readonly staffById: ReadonlyMap<StaffId, Staff>;

  constructor(private readonly input: SchedulingInput) {
    this.staffById = new Map(input.staff.map((s) => [s.id, s]));
  }

  eligible(staffId: StaffId, day: DayOfWeek, shift: Shift, state: RosterState): Verdict {
    const staff = this.staffById.get(staffId);
    if (!staff) {
      // A caller bug (an unknown staffId), not a feasibility case — scheduling-core trusts its
      // input completely (directives/zod_validation.md §4); this is not user input to reject.
      throw new Error(`FeasibilityGate.eligible: unknown staffId "${staffId}" — not in SchedulingInput.staff`);
    }

    const existingOnDay = state.assignmentsOn(staffId, day);

    // H3 — already assigned this exact (day, shift).
    if (existingOnDay.some((d) => d.shift.id === shift.id)) {
      return { ok: false, reason: 'ALREADY_ASSIGNED' };
    }

    // H2 — overlaps a shift already assigned to this staff member on this day.
    if (existingOnDay.some((d) => shiftsOverlap(d.shift, shift))) {
      return { ok: false, reason: 'OVERLAPS_EXISTING_SHIFT' };
    }

    // H1 — would exceed the contracted weekly maximum. maxWeeklyHours === 0 blocks every seat,
    // by construction (0 + shiftHours(shift) > 0 for any real shift) — never divides by zero.
    const projectedHours = state.hours(staffId) + shiftHours(shift);
    if (projectedHours > staff.maxWeeklyHours) {
      return { ok: false, reason: 'WOULD_EXCEED_MAX_HOURS' };
    }

    // H4 — per-staff availability. Specified, unimplemented (init plan §1's stretch slot: the
    // slot exists in ReasonCode/model/types.ts; nothing calls it yet).

    return { ok: true, eligibility: eligibilityOf({ staffId, day, shift }) };
  }
}
