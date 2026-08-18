// Stage 5 — diagnostics (init plan §7.6). generateRoster never throws and never silently drops a
// seat: this is where every shortfall becomes a reported fact instead of a swallowed one.
import { FeasibilityGate, type RosterState } from '../assignment/feasibility-gate.js';
import { utilisationOf } from '../assignment/utilisation.js';
import { hoursTouchedBy, shiftHours } from '../model/hour-range.js';
import type {
  DayOfWeek,
  Diagnostics,
  HourCoverageStatus,
  HourDiagnostic,
  ReasonCode,
  RequiredGrid,
  SchedulingInput,
  ShiftRequirements,
  StaffDiagnostic,
  StructuralVerdict,
  UnfilledSeat,
} from '../model/types.js';

function hourDiagnostics(required: RequiredGrid, state: RosterState, shifts: SchedulingInput['shifts']): HourDiagnostic[] {
  const shiftById = new Map(shifts.map((s) => [s.id, s]));
  const scheduled = new Map<DayOfWeek, Map<number, number>>();

  for (const a of state.all()) {
    const shift = shiftById.get(a.shift.id) ?? a.shift;
    const dayMap = scheduled.get(a.day) ?? new Map<number, number>();
    for (const h of hoursTouchedBy(shift)) dayMap.set(h, (dayMap.get(h) ?? 0) + 1);
    scheduled.set(a.day, dayMap);
  }

  const result: HourDiagnostic[] = [];
  for (const [day, hours] of required) {
    for (const [hour, requiredCount] of hours) {
      const scheduledCount = scheduled.get(day)?.get(hour) ?? 0;
      const status: HourCoverageStatus =
        scheduledCount < requiredCount ? 'UNDERSTAFFED' : scheduledCount > requiredCount ? 'OVERSTAFFED' : 'OK';
      result.push({ day, hour, required: requiredCount, scheduled: scheduledCount, status });
    }
  }
  // Deterministic order: (day, hour) ascending — the UI renders a grid, not a random walk.
  return result.sort((a, b) => (a.day !== b.day ? a.day - b.day : a.hour - b.hour));
}

function staffDiagnostics(input: SchedulingInput, state: RosterState): StaffDiagnostic[] {
  return [...input.staff]
    .sort((a, b) => (a.name !== b.name ? (a.name < b.name ? -1 : 1) : a.id < b.id ? -1 : 1))
    .map((staff) => {
      const utilisation = utilisationOf(staff, state);
      // maxWeeklyHours === 0 ⇒ utilisation is defined as 1 (fully "utilised") and never
      // below-target — a person contracted for zero hours is not under-utilised (phase-1 plan §2.5).
      const belowTarget = staff.maxWeeklyHours > 0 && utilisation < input.parameters.minUtilisationTarget;
      return {
        staffId: staff.id,
        assignedHours: state.hours(staff.id),
        maxWeeklyHours: staff.maxWeeklyHours,
        utilisation,
        belowTarget,
      };
    });
}

/** Every (day, shift) whose FLOOR was not fully met, with the reason code that blocked every
 *  staff member not already assigned there. A seat short of `target` but at `floor` is not
 *  reported here — that shortfall is the structural verdict's job (capacity vs contracted). */
function unfilledSeats(
  input: SchedulingInput,
  requirements: ShiftRequirements,
  gate: FeasibilityGate,
  state: RosterState,
): UnfilledSeat[] {
  const result: UnfilledSeat[] = [];
  const orderedShifts = [...input.shifts].sort((a, b) => a.startMinute - b.startMinute || (a.id < b.id ? -1 : 1));

  for (const [day, byShift] of [...requirements.entries()].sort((a, b) => a[0] - b[0])) {
    for (const shift of orderedShifts) {
      const headcount = byShift.get(shift.id);
      if (!headcount || headcount.floor === 0) continue;
      const filled = state.countOn(day, shift.id);
      if (filled >= headcount.floor) continue;

      const reasons = new Set<ReasonCode>();
      for (const staff of input.staff) {
        const verdict = gate.eligible(staff.id, day, shift, state);
        if (!verdict.ok) reasons.add(verdict.reason);
      }
      result.push({ day, shiftId: shift.id, blockedReasons: [...reasons].sort() });
    }
  }
  return result;
}

function structuralVerdict(requirements: ShiftRequirements, input: SchedulingInput): StructuralVerdict {
  const shiftById = new Map(input.shifts.map((s) => [s.id, s]));
  let floorStaffHours = 0;
  for (const byShift of requirements.values()) {
    for (const [shiftId, { floor }] of byShift) {
      const shift = shiftById.get(shiftId);
      if (shift) floorStaffHours += floor * shiftHours(shift);
    }
  }
  const contractedStaffHours = input.staff.reduce((sum, s) => sum + s.maxWeeklyHours, 0);
  return { floorStaffHours, contractedStaffHours };
}

export function buildDiagnostics(
  input: SchedulingInput,
  required: RequiredGrid,
  requirements: ShiftRequirements,
  gate: FeasibilityGate,
  state: RosterState,
): Diagnostics {
  return {
    hours: hourDiagnostics(required, state, input.shifts),
    staff: staffDiagnostics(input, state),
    unfilledSeats: unfilledSeats(input, requirements, gate, state),
    structural: structuralVerdict(requirements, input),
  };
}
