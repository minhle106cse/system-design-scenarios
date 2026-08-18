import { describe, expect, it } from 'vitest';
import { rebalance } from './rebalancer.js';
import { FeasibilityGate, RosterState } from './feasibility-gate.js';
import { utilisationOf } from './utilisation.js';
import type { SchedulingInput, Shift, Staff } from '../model/types.js';

const MON: Shift = { id: 'mon-shift', label: 'Mon', startMinute: 7 * 60, endMinute: 15 * 60 };
const TUE: Shift = { id: 'tue-shift', label: 'Tue', startMinute: 7 * 60, endMinute: 15 * 60 };
const WED: Shift = { id: 'wed-shift', label: 'Wed', startMinute: 7 * 60, endMinute: 15 * 60 };

function input(staff: Staff[]): SchedulingInput {
  return {
    staff,
    shifts: [MON, TUE, WED],
    demand: new Map(),
    parameters: { transactionsPerStaffHour: 18, minStaffWhenOpen: 1, minUtilisationTarget: 0.6 },
  };
}

describe('rebalance', () => {
  it('moves an assignment from an over-loaded staff member to an idle one when it strictly shrinks the gap', () => {
    const heavy: Staff = { id: 'heavy', name: 'Heavy', maxWeeklyHours: 16 }; // 2x8h shifts = 100%
    const idle: Staff = { id: 'idle', name: 'Idle', maxWeeklyHours: 40 }; // 0% so far
    const theInput = input([heavy, idle]);
    const gate = new FeasibilityGate(theInput);
    let state = new RosterState();

    // Give `heavy` both shifts on two different days directly (bypassing the assigner, simulating
    // an unfair outcome the rebalancer should fix).
    for (const [day, shift] of [[1, MON], [2, TUE]] as const) {
      const verdict = gate.eligible('heavy', day, shift, state);
      expect(verdict.ok).toBe(true);
      if (verdict.ok) state.commit(verdict.eligibility);
    }

    const gapBefore = Math.abs(utilisationOf(heavy, state) - utilisationOf(idle, state));
    expect(gapBefore).toBeCloseTo(1, 5); // heavy=100%, idle=0%

    state = rebalance(theInput, { gate, state });

    const gapAfter = Math.abs(utilisationOf(heavy, state) - utilisationOf(idle, state));
    expect(gapAfter).toBeLessThan(gapBefore);
    expect(state.hours('idle')).toBeGreaterThan(0);
  });

  it('never reduces coverage for any (day, shift) seat', () => {
    const a: Staff = { id: 'a', name: 'A', maxWeeklyHours: 24 };
    const b: Staff = { id: 'b', name: 'B', maxWeeklyHours: 40 };
    const theInput = input([a, b]);
    const gate = new FeasibilityGate(theInput);
    let state = new RosterState();
    for (const [staffId, day, shift] of [
      ['a', 1, MON],
      ['a', 2, TUE],
      ['a', 3, WED],
    ] as const) {
      const verdict = gate.eligible(staffId, day, shift, state);
      if (verdict.ok) state.commit(verdict.eligibility);
    }
    const before = new Map([
      ['1:mon-shift', state.countOn(1, 'mon-shift')],
      ['2:tue-shift', state.countOn(2, 'tue-shift')],
      ['3:wed-shift', state.countOn(3, 'wed-shift')],
    ]);

    state = rebalance(theInput, { gate, state });

    for (const [key, countBefore] of before) {
      const [day, shiftId] = key.split(':');
      expect(state.countOn(Number(day) as 1 | 2 | 3, shiftId!)).toBeGreaterThanOrEqual(countBefore);
    }
  });

  it('terminates (does not loop forever) when no improving move exists — e.g. a single staff member', () => {
    const solo: Staff = { id: 'solo', name: 'Solo', maxWeeklyHours: 40 };
    const theInput = input([solo]);
    const gate = new FeasibilityGate(theInput);
    const state = new RosterState();
    const result = rebalance(theInput, { gate, state }, 200);
    expect(result).toBeDefined(); // completes without hanging — the real assertion is "this test finishes"
  });

  it('respects a custom iteration cap without throwing', () => {
    const heavy: Staff = { id: 'heavy', name: 'Heavy', maxWeeklyHours: 16 };
    const idle: Staff = { id: 'idle', name: 'Idle', maxWeeklyHours: 40 };
    const theInput = input([heavy, idle]);
    const gate = new FeasibilityGate(theInput);
    let state = new RosterState();
    const verdict = gate.eligible('heavy', 1, MON, state);
    if (verdict.ok) state.commit(verdict.eligibility);
    expect(() => rebalance(theInput, { gate, state }, 0)).not.toThrow();
  });
});
