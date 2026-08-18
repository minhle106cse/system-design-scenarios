import { describe, expect, it } from 'vitest';
import { coveragePass, fairnessPass, rolePass } from './assigner.js';
import { FeasibilityGate, RosterState, type RosterContext } from './feasibility-gate.js';
import { computeRequiredStaff } from '../demand/demand-model.js';
import { computeShiftRequirements } from '../requirements/shift-requirements.js';
import type { DemandGrid, SchedulingInput, Shift, Staff } from '../model/types.js';

const MORNING: Shift = { id: 'morning', label: 'Morning', startMinute: 7 * 60, endMinute: 15 * 60 };
const EVENING: Shift = { id: 'evening', label: 'Evening', startMinute: 15 * 60, endMinute: 23 * 60 };

function buildInput(staff: Staff[], demand: DemandGrid): SchedulingInput {
  return {
    staff,
    shifts: [MORNING, EVENING],
    demand,
    parameters: { transactionsPerStaffHour: 18, minStaffWhenOpen: 1, minUtilisationTarget: 0.6 },
  };
}

function busyDemand(day: 1 = 1): DemandGrid {
  const hours = new Map<number, number>();
  for (let h = 7; h < 23; h++) hours.set(h, 100); // deliberately busy — every seat wants headcount
  return new Map([[day, hours]]);
}

describe('rolePass (stretch-goals plan §2a)', () => {
  const SUPERVISED_MORNING: Shift = {
    id: 'morning',
    label: 'Morning',
    startMinute: 7 * 60,
    endMinute: 15 * 60,
    roleRequirements: [{ roleId: 'supervisor', minCount: 1 }],
  };

  it('fills the role seat with a role-holder even when a non-holder has lower utilisation', () => {
    const supervisor: Staff = { id: 'sup', name: 'Sup', maxWeeklyHours: 40, roles: ['supervisor'] };
    const nonHolder: Staff = { id: 'reg', name: 'Reg', maxWeeklyHours: 40 };
    const input: SchedulingInput = {
      staff: [supervisor, nonHolder],
      shifts: [SUPERVISED_MORNING],
      demand: busyDemand(),
      parameters: { transactionsPerStaffHour: 18, minStaffWhenOpen: 1, minUtilisationTarget: 0.6 },
    };
    const gate = new FeasibilityGate(input);
    const state = new RosterState();
    const roster: RosterContext = { gate, state };
    const required = computeRequiredStaff(input.demand, input.parameters);
    const requirements = computeShiftRequirements(required, input.shifts);

    rolePass(input, requirements, roster);

    expect(state.assignmentsFor('sup').some((a) => a.day === 1 && a.shift.id === 'morning')).toBe(true);
  });

  it('leaves the seat unfilled — never invents a role-holder — when nobody holds the role', () => {
    const nonHolder: Staff = { id: 'reg', name: 'Reg', maxWeeklyHours: 40 };
    const input: SchedulingInput = {
      staff: [nonHolder],
      shifts: [SUPERVISED_MORNING],
      demand: busyDemand(),
      parameters: { transactionsPerStaffHour: 18, minStaffWhenOpen: 1, minUtilisationTarget: 0.6 },
    };
    const gate = new FeasibilityGate(input);
    const state = new RosterState();
    const roster: RosterContext = { gate, state };
    const required = computeRequiredStaff(input.demand, input.parameters);
    const requirements = computeShiftRequirements(required, input.shifts);

    expect(() => rolePass(input, requirements, roster)).not.toThrow();
    expect(state.countOn(1, 'morning')).toBe(0);
  });

  it('a shift with no roleRequirements is untouched by rolePass', () => {
    const plain: Shift = { id: 'evening', label: 'Evening', startMinute: 15 * 60, endMinute: 23 * 60 };
    const staff: Staff = { id: 'a', name: 'A', maxWeeklyHours: 40 };
    const input: SchedulingInput = {
      staff: [staff],
      shifts: [plain],
      demand: busyDemand(),
      parameters: { transactionsPerStaffHour: 18, minStaffWhenOpen: 1, minUtilisationTarget: 0.6 },
    };
    const gate = new FeasibilityGate(input);
    const state = new RosterState();
    rolePass(input, computeShiftRequirements(computeRequiredStaff(input.demand, input.parameters), input.shifts), { gate, state });
    expect(state.all()).toEqual([]);
  });
});

describe('fairnessPass', () => {
  it('prefers a staff member below U_min over one already above it, even if the above-target one is idle so far', () => {
    const alreadyBusy: Staff = { id: 'busy', name: 'Busy', maxWeeklyHours: 8 }; // one 8h shift = 100% already
    const idle: Staff = { id: 'idle', name: 'Idle', maxWeeklyHours: 40 };
    const input = buildInput([alreadyBusy, idle], busyDemand());
    const gate = new FeasibilityGate(input);
    const state = new RosterState();
    const roster: RosterContext = { gate, state };

    // Pre-fill `alreadyBusy` to 100% utilisation via a direct commit (simulating prior work).
    const pre = gate.eligible('busy', 1, MORNING, state);
    expect(pre.ok).toBe(true);
    if (pre.ok) state.commit(pre.eligibility);

    const required = computeRequiredStaff(input.demand, input.parameters);
    const requirements = computeShiftRequirements(required, input.shifts);
    fairnessPass(input, requirements, roster);

    // idle (0% utilisation, below U_min=0.6) must have been picked for the evening seat over busy
    // (already 100%, above U_min, and also H2-blocked from a second morning-overlapping shift).
    const idleAssignments = state.assignmentsFor('idle');
    expect(idleAssignments.length).toBeGreaterThan(0);
  });

  it('never assigns a seat to nobody when at least one below-target candidate is eligible', () => {
    const a: Staff = { id: 'a', name: 'A', maxWeeklyHours: 40 };
    const input = buildInput([a], busyDemand());
    const gate = new FeasibilityGate(input);
    const state = new RosterState();
    const roster: RosterContext = { gate, state };
    const required = computeRequiredStaff(input.demand, input.parameters);
    const requirements = computeShiftRequirements(required, input.shifts);
    fairnessPass(input, requirements, roster);
    expect(state.all().length).toBeGreaterThan(0);
  });
});

describe('coveragePass', () => {
  it('fills every floor seat when enough staff-hours exist, then tops up toward target', () => {
    const staff: Staff[] = Array.from({ length: 6 }, (_, i) => ({
      id: `s${i}`,
      name: `Staff ${i}`,
      maxWeeklyHours: 40,
    }));
    const input = buildInput(staff, busyDemand());
    const gate = new FeasibilityGate(input);
    const state = new RosterState();
    const roster: RosterContext = { gate, state };
    const required = computeRequiredStaff(input.demand, input.parameters);
    const requirements = computeShiftRequirements(required, input.shifts);

    fairnessPass(input, requirements, roster);
    coveragePass(input, requirements, roster);

    const morningCount = state.countOn(1, 'morning');
    const eveningCount = state.countOn(1, 'evening');
    const morningFloor = requirements.get(1)!.get('morning')!.floor;
    const eveningFloor = requirements.get(1)!.get('evening')!.floor;
    expect(morningCount).toBeGreaterThanOrEqual(Math.min(morningFloor, staff.length));
    expect(eveningCount).toBeGreaterThanOrEqual(Math.min(eveningFloor, staff.length));
  });

  it('leaves a seat under-filled rather than throwing when capacity runs out', () => {
    const one: Staff = { id: 'solo', name: 'Solo', maxWeeklyHours: 8 }; // can cover exactly one shift
    const input = buildInput([one], busyDemand());
    const gate = new FeasibilityGate(input);
    const state = new RosterState();
    const roster: RosterContext = { gate, state };
    const required = computeRequiredStaff(input.demand, input.parameters);
    const requirements = computeShiftRequirements(required, input.shifts);

    expect(() => {
      fairnessPass(input, requirements, roster);
      coveragePass(input, requirements, roster);
    }).not.toThrow();

    // Both morning and evening want more than 1 person (busy demand), but only 1 staff exists —
    // at most one of the two shifts is filled, the other stays at 0. Never invented, never thrown.
    const filledSeats = state.all().length;
    expect(filledSeats).toBeLessThanOrEqual(1);
  });
});
