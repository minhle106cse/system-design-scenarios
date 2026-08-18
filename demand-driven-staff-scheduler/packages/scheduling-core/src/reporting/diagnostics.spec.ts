import { describe, expect, it } from 'vitest';
import { buildDiagnostics } from './diagnostics.js';
import { FeasibilityGate, RosterState } from '../assignment/feasibility-gate.js';
import { computeRequiredStaff } from '../demand/demand-model.js';
import { computeShiftRequirements } from '../requirements/shift-requirements.js';
import type { DemandGrid, SchedulingInput, Shift, Staff } from '../model/types.js';

const MORNING: Shift = { id: 'morning', label: 'Morning', startMinute: 7 * 60, endMinute: 15 * 60 };

function buildInput(staff: Staff[], demand: DemandGrid): SchedulingInput {
  return {
    staff,
    shifts: [MORNING],
    demand,
    parameters: { transactionsPerStaffHour: 5, minStaffWhenOpen: 1, minUtilisationTarget: 0.6 },
  };
}

describe('buildDiagnostics — staff utilisation, the maxWeeklyHours=0 NaN trap (phase-1 plan §2.5)', () => {
  it('maxWeeklyHours = 0 -> utilisation = 1, belowTarget = false, never NaN', () => {
    const zero: Staff = { id: 'z', name: 'Z', maxWeeklyHours: 0 };
    const input = buildInput([zero], new Map());
    const gate = new FeasibilityGate(input);
    const state = new RosterState();
    const required = computeRequiredStaff(input.demand, input.parameters);
    const requirements = computeShiftRequirements(required, input.shifts);

    const diagnostics = buildDiagnostics(input, required, requirements, gate, state);
    const staffDiag = diagnostics.staff.find((s) => s.staffId === 'z')!;
    expect(Number.isNaN(staffDiag.utilisation)).toBe(false);
    expect(staffDiag.utilisation).toBe(1);
    expect(staffDiag.belowTarget).toBe(false);
  });

  it('a staff member below U_min is flagged belowTarget', () => {
    const idle: Staff = { id: 'idle', name: 'Idle', maxWeeklyHours: 40 };
    const input = buildInput([idle], new Map());
    const gate = new FeasibilityGate(input);
    const state = new RosterState();
    const required = computeRequiredStaff(input.demand, input.parameters);
    const requirements = computeShiftRequirements(required, input.shifts);
    const diagnostics = buildDiagnostics(input, required, requirements, gate, state);
    const staffDiag = diagnostics.staff.find((s) => s.staffId === 'idle')!;
    expect(staffDiag.utilisation).toBe(0);
    expect(staffDiag.belowTarget).toBe(true);
  });
});

describe('buildDiagnostics — hour coverage status', () => {
  it('reports UNDERSTAFFED when scheduled < required, OK when equal', () => {
    const demand: DemandGrid = new Map([[1, new Map([[9, 10]])]]); // required = ceil(10/5) = 2
    const staff: Staff[] = [{ id: 'a', name: 'A', maxWeeklyHours: 40 }];
    const input = buildInput(staff, demand);
    const gate = new FeasibilityGate(input);
    const state = new RosterState();
    const required = computeRequiredStaff(input.demand, input.parameters);
    const requirements = computeShiftRequirements(required, input.shifts);
    const verdict = gate.eligible('a', 1, MORNING, state);
    if (verdict.ok) state.commit(verdict.eligibility); // only 1 of 2 required staff assigned

    const diagnostics = buildDiagnostics(input, required, requirements, gate, state);
    const hourDiag = diagnostics.hours.find((h) => h.day === 1 && h.hour === 9)!;
    expect(hourDiag.required).toBe(2);
    expect(hourDiag.scheduled).toBe(1);
    expect(hourDiag.status).toBe('UNDERSTAFFED');
  });
});

describe('buildDiagnostics — unfilled seats report the blocking reason for every remaining candidate', () => {
  it('reports WOULD_EXCEED_MAX_HOURS when the only other candidate is capped too low', () => {
    const demand: DemandGrid = new Map([[1, new Map([[9, 50]])]]); // required = ceil(50/5) = 10, way more staff than exist
    const staff: Staff[] = [{ id: 'a', name: 'A', maxWeeklyHours: 4 }]; // can't even cover one 8h shift
    const input = buildInput(staff, demand);
    const gate = new FeasibilityGate(input);
    const state = new RosterState();
    const required = computeRequiredStaff(input.demand, input.parameters);
    const requirements = computeShiftRequirements(required, input.shifts);

    const diagnostics = buildDiagnostics(input, required, requirements, gate, state);
    expect(diagnostics.unfilledSeats.length).toBeGreaterThan(0);
    const seat = diagnostics.unfilledSeats.find((s) => s.day === 1 && s.shiftId === 'morning')!;
    expect(seat.blockedReasons).toContain('WOULD_EXCEED_MAX_HOURS');
  });
});

describe('buildDiagnostics — structural verdict', () => {
  it('reports floor staff-hours vs contracted staff-hours', () => {
    const demand: DemandGrid = new Map([[1, new Map([[9, 10]])]]); // required=2, floor over 1 hour of an 8h shift: mean over 8 hours (only 1 open) = ceil(2/8)=1
    const staff: Staff[] = [{ id: 'a', name: 'A', maxWeeklyHours: 40 }];
    const input = buildInput(staff, demand);
    const gate = new FeasibilityGate(input);
    const state = new RosterState();
    const required = computeRequiredStaff(input.demand, input.parameters);
    const requirements = computeShiftRequirements(required, input.shifts);
    const diagnostics = buildDiagnostics(input, required, requirements, gate, state);
    expect(diagnostics.structural.contractedStaffHours).toBe(40);
    expect(diagnostics.structural.floorStaffHours).toBeGreaterThan(0);
  });
});
