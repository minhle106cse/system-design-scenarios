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

    const diagnostics = buildDiagnostics(input, required, requirements, { gate, state });
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
    const diagnostics = buildDiagnostics(input, required, requirements, { gate, state });
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

    const diagnostics = buildDiagnostics(input, required, requirements, { gate, state });
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

    const diagnostics = buildDiagnostics(input, required, requirements, { gate, state });
    expect(diagnostics.unfilledSeats.length).toBeGreaterThan(0);
    const seat = diagnostics.unfilledSeats.find((s) => s.day === 1 && s.shiftId === 'morning')!;
    expect(seat.blockedReasons).toContain('WOULD_EXCEED_MAX_HOURS');
  });
});

describe('buildDiagnostics — role shortfalls (stretch-goals plan §2a)', () => {
  const SHIFT_WITH_SUPERVISOR: Shift = {
    id: 'morning',
    label: 'Morning',
    startMinute: 7 * 60,
    endMinute: 15 * 60,
    roleRequirements: [{ roleId: 'supervisor', minCount: 1 }],
  };

  it('reports a shortfall when nobody with the role is assigned to the seat', () => {
    const staff: Staff[] = [{ id: 'a', name: 'A', maxWeeklyHours: 40 }]; // no roles
    const input: SchedulingInput = {
      staff,
      shifts: [SHIFT_WITH_SUPERVISOR],
      demand: new Map([[1, new Map([[9, 10]])]]), // floor > 0 — the seat is actually needed, not closed
      parameters: { transactionsPerStaffHour: 5, minStaffWhenOpen: 1, minUtilisationTarget: 0.6 },
    };
    const gate = new FeasibilityGate(input);
    const state = new RosterState();
    const verdict = gate.eligible('a', 1, SHIFT_WITH_SUPERVISOR, state);
    if (verdict.ok) state.commit(verdict.eligibility); // filled, but not by a supervisor
    const required = computeRequiredStaff(input.demand, input.parameters);
    const requirements = computeShiftRequirements(required, input.shifts);

    const diagnostics = buildDiagnostics(input, required, requirements, { gate, state });
    const shortfall = diagnostics.roleShortfalls.find((s) => s.day === 1 && s.shiftId === 'morning');
    expect(shortfall).toEqual({ day: 1, shiftId: 'morning', roleId: 'supervisor', required: 1, assigned: 0 });
  });

  it('reports nothing once a role-holder is assigned', () => {
    const staff: Staff[] = [{ id: 'a', name: 'A', maxWeeklyHours: 40, roles: ['supervisor'] }];
    const input: SchedulingInput = {
      staff,
      shifts: [SHIFT_WITH_SUPERVISOR],
      demand: new Map([[1, new Map([[9, 10]])]]), // floor > 0 — the seat is actually needed, not closed
      parameters: { transactionsPerStaffHour: 5, minStaffWhenOpen: 1, minUtilisationTarget: 0.6 },
    };
    const gate = new FeasibilityGate(input);
    const state = new RosterState();
    const verdict = gate.eligible('a', 1, SHIFT_WITH_SUPERVISOR, state);
    if (verdict.ok) state.commit(verdict.eligibility);
    const required = computeRequiredStaff(input.demand, input.parameters);
    const requirements = computeShiftRequirements(required, input.shifts);

    const diagnostics = buildDiagnostics(input, required, requirements, { gate, state });
    expect(diagnostics.roleShortfalls.filter((s) => s.day === 1 && s.shiftId === 'morning')).toEqual([]);
  });

  it('a shift with no roleRequirements reports nothing', () => {
    const plain: Shift = { id: 'evening', label: 'Evening', startMinute: 15 * 60, endMinute: 23 * 60 };
    const staff: Staff[] = [{ id: 'a', name: 'A', maxWeeklyHours: 40 }];
    const input: SchedulingInput = {
      staff,
      shifts: [plain],
      demand: new Map(),
      parameters: { transactionsPerStaffHour: 5, minStaffWhenOpen: 1, minUtilisationTarget: 0.6 },
    };
    const gate = new FeasibilityGate(input);
    const state = new RosterState();
    const required = computeRequiredStaff(input.demand, input.parameters);
    const requirements = computeShiftRequirements(required, input.shifts);
    const diagnostics = buildDiagnostics(input, required, requirements, { gate, state });
    expect(diagnostics.roleShortfalls).toEqual([]);
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
    const diagnostics = buildDiagnostics(input, required, requirements, { gate, state });
    expect(diagnostics.structural.contractedStaffHours).toBe(40);
    expect(diagnostics.structural.floorStaffHours).toBeGreaterThan(0);
  });
});

describe('buildDiagnostics — role capacity (the structural verdict, scoped to one role)', () => {
  const SHIFT_WITH_SUPERVISOR: Shift = {
    id: 'morning',
    label: 'Morning',
    startMinute: 7 * 60,
    endMinute: 15 * 60, // 8h
    roleRequirements: [{ roleId: 'supervisor', minCount: 1 }],
  };

  function build(staff: Staff[], demand: DemandGrid, shifts: Shift[] = [SHIFT_WITH_SUPERVISOR]) {
    const input: SchedulingInput = {
      staff,
      shifts,
      demand,
      parameters: { transactionsPerStaffHour: 5, minStaffWhenOpen: 1, minUtilisationTarget: 0.6 },
    };
    const gate = new FeasibilityGate(input);
    const state = new RosterState();
    const required = computeRequiredStaff(input.demand, input.parameters);
    const requirements = computeShiftRequirements(required, input.shifts);
    return buildDiagnostics(input, required, requirements, { gate, state });
  }

  it('a role nobody requires (no shift references it) reports nothing', () => {
    const plain: Shift = { id: 'evening', label: 'Evening', startMinute: 15 * 60, endMinute: 23 * 60 };
    const diagnostics = build([{ id: 'a', name: 'A', maxWeeklyHours: 40 }], new Map(), [plain]);
    expect(diagnostics.roleCapacity).toEqual([]);
  });

  it('always reported, even when the seat is fully covered — not only-when-short', () => {
    const staff: Staff[] = [{ id: 'a', name: 'A', maxWeeklyHours: 40, roles: ['supervisor'] }];
    const demand: DemandGrid = new Map([[1, new Map([[9, 10]])]]); // needs the shift on 1 day only
    const diagnostics = build(staff, demand);
    expect(diagnostics.roleCapacity).toEqual([
      { roleId: 'supervisor', requiredRoleHours: 8, contractedRoleHours: 40 },
    ]);
  });

  it('a genuine capacity gap: 7 days need the role, one holder cannot cover them all', () => {
    // Reproduces the real gap found reviewing this schedule's algorithm: a lone role-holder gets
    // pinned to their weekly max while roleShortfalls appears on the days they run out of hours —
    // this diagnostic is what makes that a STAFFING fact instead of a mystery.
    const staff: Staff[] = [{ id: 'x', name: 'X', maxWeeklyHours: 40, roles: ['supervisor'] }];
    const demand: DemandGrid = new Map(
      ([1, 2, 3, 4, 5, 6, 7] as const).map((day) => [day, new Map([[9, 10]])]),
    );
    const diagnostics = build(staff, demand);
    expect(diagnostics.roleCapacity).toEqual([
      { roleId: 'supervisor', requiredRoleHours: 56, contractedRoleHours: 40 }, // 7 days x 8h > 40h max
    ]);
    expect(diagnostics.roleCapacity[0]!.requiredRoleHours).toBeGreaterThan(
      diagnostics.roleCapacity[0]!.contractedRoleHours,
    );
  });

  it('a closed day (no demand) contributes nothing — same skip roleShortfalls uses', () => {
    const staff: Staff[] = [{ id: 'a', name: 'A', maxWeeklyHours: 40, roles: ['supervisor'] }];
    // Only day 1 has demand; days 2-7 are fully closed and must not inflate requiredRoleHours.
    const demand: DemandGrid = new Map([[1, new Map([[9, 10]])]]);
    const diagnostics = build(staff, demand);
    expect(diagnostics.roleCapacity).toEqual([
      { roleId: 'supervisor', requiredRoleHours: 8, contractedRoleHours: 40 },
    ]);
  });

  it('a staff member holding the role but not referenced by any requirement is excluded from contractedRoleHours', () => {
    const staff: Staff[] = [
      { id: 'a', name: 'A', maxWeeklyHours: 40, roles: ['supervisor'] },
      { id: 'b', name: 'B', maxWeeklyHours: 20, roles: ['cashier'] }, // holds a DIFFERENT, unreferenced role
    ];
    const demand: DemandGrid = new Map([[1, new Map([[9, 10]])]]);
    const diagnostics = build(staff, demand);
    expect(diagnostics.roleCapacity).toEqual([
      { roleId: 'supervisor', requiredRoleHours: 8, contractedRoleHours: 40 }, // B's 20h never counted
    ]);
  });

  it('multiple roles report independently, sorted by roleId', () => {
    const withTwoRoles: Shift = {
      ...SHIFT_WITH_SUPERVISOR,
      roleRequirements: [
        { roleId: 'supervisor', minCount: 1 },
        { roleId: 'cashier', minCount: 2 },
      ],
    };
    const staff: Staff[] = [
      { id: 'a', name: 'A', maxWeeklyHours: 40, roles: ['supervisor'] },
      { id: 'b', name: 'B', maxWeeklyHours: 20, roles: ['cashier'] },
    ];
    const demand: DemandGrid = new Map([[1, new Map([[9, 10]])]]);
    const diagnostics = build(staff, demand, [withTwoRoles]);
    expect(diagnostics.roleCapacity).toEqual([
      { roleId: 'cashier', requiredRoleHours: 16, contractedRoleHours: 20 }, // minCount 2 x 8h
      { roleId: 'supervisor', requiredRoleHours: 8, contractedRoleHours: 40 },
    ]);
  });
});
