// Stage 3a — the FeasibilityGate (init plan §7.4, ADR-0001). ⭐ The chokepoint the whole
// constraint-enforcement argument rests on: this is the ONLY way an assignment can enter a
// RosterState. Read `eligibility-brand.ts` first if you need to know WHY `Eligibility` is opaque;
// this file only needs to know that `eligible()` is the one place one gets minted.
import { shiftHours, shiftsOverlap } from '../model/hour-range.js';
import { eligibilityOf } from './eligibility-brand.js';
import { RosterState } from './roster-state.js';
import type { Eligibility, EligibilityData } from './eligibility-brand.js';
import type { DayOfWeek, ReasonCode, SchedulingInput, Shift, Staff, StaffId } from '../model/types.js';

export type { Eligibility, EligibilityData } from './eligibility-brand.js';
export { RosterState } from './roster-state.js';

export type Verdict = { readonly ok: true; readonly eligibility: Eligibility } | { readonly ok: false; readonly reason: ReasonCode };

/**
 * `gate` and `state` are always the same pair, created together from the same `SchedulingInput`
 * and threaded through every stage after Stage 3a — never one from a different input than the
 * other. Bundling them into one plain (still not a class — `directives/domain_modeling.md` §1)
 * value halves the positional-argument count on every stage function and makes "pass a `state`
 * from a different `gate`'s input" impossible to do by accident: there is only one thing to pass,
 * not two that must happen to agree.
 */
export interface RosterContext {
  readonly gate: FeasibilityGate;
  readonly state: RosterState;
}

/**
 * H1–H4 (init plan §7.4). **Evaluation order is load-bearing and pinned: H4 → H3 → H2 → H1**
 * (H4 moved to the front, stretch-goals plan §1a, 2026-08-18 — see the note at its check below).
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

    // H4 — per-staff availability. Checked FIRST: H1–H3 are roster-relative facts a manager can
    // fix by moving assignments around; H4 is a fact about the person that no roster edit
    // changes, so it is the more actionable diagnostic. Pure function of (staff, day, shift) —
    // reads no RosterState, so it cannot make a verdict depend on replay order (the invariant
    // rebalancer.ts:50-54 relies on).
    if (staff.unavailability?.some((w) => w.day === day && shiftsOverlap(w, shift))) {
      return { ok: false, reason: 'UNAVAILABLE' };
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

    return { ok: true, eligibility: eligibilityOf({ staffId, day, shift }) };
  }
}
