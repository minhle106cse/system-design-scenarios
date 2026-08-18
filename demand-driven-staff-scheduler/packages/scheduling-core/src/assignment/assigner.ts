// Stage 3b — the assigner (init plan §7.5, ADR-0002). Two deterministic passes; the third
// (rebalance) is rebalancer.ts. Every commit goes through FeasibilityGate — this file never
// touches RosterState except via `commit` and its query methods.
import { FeasibilityGate, type RosterState } from './feasibility-gate.js';
import { compareByNameThenId, utilisationOf } from './utilisation.js';
import type { DayOfWeek, SchedulingInput, Shift, ShiftId, ShiftRequirements, Staff } from '../model/types.js';

interface Seat {
  readonly day: DayOfWeek;
  readonly shift: Shift;
}

/** Every (day, shift) pair with a positive floor or target, in a fixed deterministic order. */
function enumerateSeats(shifts: readonly Shift[], requirements: ShiftRequirements): Seat[] {
  const orderedShifts = [...shifts].sort((a, b) => {
    if (a.startMinute !== b.startMinute) return a.startMinute - b.startMinute;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  const seats: Seat[] = [];
  for (const [day, byShift] of [...requirements.entries()].sort((a, b) => a[0] - b[0])) {
    for (const shift of orderedShifts) {
      const headcount = byShift.get(shift.id);
      if (headcount && (headcount.floor > 0 || headcount.target > 0)) seats.push({ day, shift });
    }
  }
  return seats;
}

function headcountOf(requirements: ShiftRequirements, day: DayOfWeek, shiftId: ShiftId) {
  return requirements.get(day)?.get(shiftId) ?? { floor: 0, target: 0 };
}

/** Pick the eligible candidate with the lowest utilisation, tie-broken by (name, id). */
function pickCandidate(
  staff: readonly Staff[],
  seat: Seat,
  gate: FeasibilityGate,
  state: RosterState,
  belowUtilisation?: number,
): Staff | null {
  let best: Staff | null = null;
  let bestUtilisation = Infinity;
  for (const s of staff) {
    const u = utilisationOf(s, state);
    if (belowUtilisation !== undefined && u >= belowUtilisation) continue;
    if (!gate.eligible(s.id, seat.day, seat.shift, state).ok) continue;
    if (u < bestUtilisation || (u === bestUtilisation && best && compareByNameThenId(s, best) < 0)) {
      best = s;
      bestUtilisation = u;
    }
  }
  return best;
}

function fillSeatTo(
  target: number,
  seat: Seat,
  staff: readonly Staff[],
  gate: FeasibilityGate,
  state: RosterState,
  belowUtilisation?: number,
): void {
  while (state.countOn(seat.day, seat.shift.id) < target) {
    const candidate = pickCandidate(staff, seat, gate, state, belowUtilisation);
    if (!candidate) return; // no eligible candidate remains — leave the seat unfilled, stage 5 reports it
    const verdict = gate.eligible(candidate.id, seat.day, seat.shift, state);
    if (!verdict.ok) return; // unreachable in practice (pickCandidate only returns eligible staff)
    state.commit(verdict.eligibility);
  }
}

/**
 * Pass 1 — fairness. Walk every floor seat, preferring staff below `U_min`, lowest utilisation
 * first. A seat with no below-target candidate is left for the coverage pass — this pass never
 * blocks on a seat, it only claims what fairness can claim.
 */
export function fairnessPass(
  input: SchedulingInput,
  requirements: ShiftRequirements,
  gate: FeasibilityGate,
  state: RosterState,
): void {
  const seats = enumerateSeats(input.shifts, requirements);
  for (const seat of seats) {
    const { floor } = headcountOf(requirements, seat.day, seat.shift.id);
    fillSeatTo(floor, seat, input.staff, gate, state, input.parameters.minUtilisationTarget);
  }
}

/**
 * Pass 2 — coverage. First fill whatever floor seats fairness left open (any eligible staff,
 * lowest utilisation first), then top up toward each seat's target, largest uncovered peak
 * (target − floor) first. Capacity decides where top-up stops, not the target itself.
 */
export function coveragePass(
  input: SchedulingInput,
  requirements: ShiftRequirements,
  gate: FeasibilityGate,
  state: RosterState,
): void {
  const seats = enumerateSeats(input.shifts, requirements);

  for (const seat of seats) {
    const { floor } = headcountOf(requirements, seat.day, seat.shift.id);
    fillSeatTo(floor, seat, input.staff, gate, state);
  }

  const topUpOrder = [...seats].sort((a, b) => {
    const ha = headcountOf(requirements, a.day, a.shift.id);
    const hb = headcountOf(requirements, b.day, b.shift.id);
    const uncoveredA = ha.target - ha.floor;
    const uncoveredB = hb.target - hb.floor;
    if (uncoveredA !== uncoveredB) return uncoveredB - uncoveredA; // largest uncovered peak first
    if (a.day !== b.day) return a.day - b.day;
    return a.shift.id < b.shift.id ? -1 : a.shift.id > b.shift.id ? 1 : 0;
  });

  for (const seat of topUpOrder) {
    const { target } = headcountOf(requirements, seat.day, seat.shift.id);
    fillSeatTo(target, seat, input.staff, gate, state);
  }
}
