import { describe, expect, it } from 'vitest';
import { FeasibilityGate, RosterState, type Eligibility } from './feasibility-gate.js';
import type { SchedulingInput, Shift, Staff } from '../model/types.js';

const MORNING: Shift = { id: 'morning', label: 'Morning', startMinute: 7 * 60, endMinute: 15 * 60 };
const EVENING: Shift = { id: 'evening', label: 'Evening', startMinute: 15 * 60, endMinute: 23 * 60 };
const LATE: Shift = { id: 'late', label: 'Late', startMinute: 14 * 60, endMinute: 22 * 60 }; // overlaps MORNING and EVENING

const ALICE: Staff = { id: 'alice', name: 'Alice', maxWeeklyHours: 20 };
const ZERO_HOURS: Staff = { id: 'zero', name: 'Zero', maxWeeklyHours: 0 };

function input(staff: Staff[], shifts: Shift[] = [MORNING, EVENING, LATE]): SchedulingInput {
  return {
    staff,
    shifts,
    demand: new Map(),
    parameters: { transactionsPerStaffHour: 18, minStaffWhenOpen: 1, minUtilisationTarget: 0.6 },
  };
}

describe('FeasibilityGate — Eligibility is unforgeable (ADR-0001)', () => {
  it('cannot be built by an object literal outside feasibility-gate.ts', () => {
    // @ts-expect-error — Eligibility's brand key is a module-private `unique symbol`; a plain
    // object literal can never supply it, so this line must fail to COMPILE (not just fail an
    // assertion). If this stops erroring, the nominal-type guarantee ADR-0001 depends on is gone.
    const forged: Eligibility = { staffId: 'x', day: 1, shift: MORNING };
    expect(forged).toBeDefined(); // unreachable if the line above ever compiles
  });

  it('a same-shape `as Eligibility` cast also fails to compile', () => {
    const shaped = { staffId: 'x', day: 1 as const, shift: MORNING };
    // @ts-expect-error — same reason: the object is missing the private brand key, so a direct
    // `as` cast is rejected as insufficiently overlapping, not silently allowed.
    const forged: Eligibility = shaped as Eligibility;
    expect(forged).toBeDefined();
  });

  it('the only way to obtain one is a gate verdict with ok: true', () => {
    const gate = new FeasibilityGate(input([ALICE]));
    const state = new RosterState();
    const verdict = gate.eligible('alice', 1, MORNING, state);
    expect(verdict.ok).toBe(true);
    if (verdict.ok) state.commit(verdict.eligibility); // the only legal way to mutate RosterState
    expect(state.toRoster().assignments).toHaveLength(1);
  });
});

describe('FeasibilityGate — H1 (weekly hours cap)', () => {
  it('approves a shift within the cap', () => {
    const gate = new FeasibilityGate(input([ALICE]));
    const verdict = gate.eligible('alice', 1, MORNING, new RosterState()); // 8h <= 20h
    expect(verdict.ok).toBe(true);
  });

  it('blocks a shift that would exceed the cap', () => {
    const gate = new FeasibilityGate(input([ALICE])); // 20h cap
    const state = new RosterState();
    const first = gate.eligible('alice', 1, MORNING, state); // 8h
    expect(first.ok).toBe(true);
    if (first.ok) state.commit(first.eligibility);
    const second = gate.eligible('alice', 2, EVENING, state); // would be 16h, still ok
    expect(second.ok).toBe(true);
    if (second.ok) state.commit(second.eligibility);
    const third = gate.eligible('alice', 3, EVENING, state); // would be 24h > 20h
    expect(third).toEqual({ ok: false, reason: 'WOULD_EXCEED_MAX_HOURS' });
  });

  it('maxWeeklyHours = 0 blocks every seat, never throws, never divides by zero', () => {
    const gate = new FeasibilityGate(input([ZERO_HOURS]));
    const verdict = gate.eligible('zero', 1, MORNING, new RosterState());
    expect(verdict).toEqual({ ok: false, reason: 'WOULD_EXCEED_MAX_HOURS' });
  });
});

describe('FeasibilityGate — H2 (same-day overlap)', () => {
  it('blocks an overlapping shift on the same day', () => {
    const gate = new FeasibilityGate(input([ALICE]));
    const state = new RosterState();
    const first = gate.eligible('alice', 1, MORNING, state);
    if (first.ok) state.commit(first.eligibility);
    const overlapping = gate.eligible('alice', 1, LATE, state); // overlaps MORNING 14:00-15:00
    expect(overlapping).toEqual({ ok: false, reason: 'OVERLAPS_EXISTING_SHIFT' });
  });

  it('does not block a non-overlapping shift on the same day (back-to-back)', () => {
    const gate = new FeasibilityGate(input([ALICE]));
    const state = new RosterState();
    const first = gate.eligible('alice', 1, MORNING, state);
    if (first.ok) state.commit(first.eligibility);
    const second = gate.eligible('alice', 1, EVENING, state); // 07-15 then 15-23, exactly adjacent
    expect(second.ok).toBe(true);
  });

  it('does not block the same shift on a DIFFERENT day', () => {
    const gate = new FeasibilityGate(input([ALICE]));
    const state = new RosterState();
    const first = gate.eligible('alice', 1, MORNING, state);
    if (first.ok) state.commit(first.eligibility);
    const second = gate.eligible('alice', 2, MORNING, state);
    expect(second.ok).toBe(true);
  });
});

describe('FeasibilityGate — H3 (already assigned), and precedence H3 → H2 → H1', () => {
  it('blocks the exact same (day, shift) twice', () => {
    const gate = new FeasibilityGate(input([ALICE]));
    const state = new RosterState();
    const first = gate.eligible('alice', 1, MORNING, state);
    if (first.ok) state.commit(first.eligibility);
    const duplicate = gate.eligible('alice', 1, MORNING, state);
    expect(duplicate).toEqual({ ok: false, reason: 'ALREADY_ASSIGNED' });
  });

  it('reports ALREADY_ASSIGNED, not OVERLAPS_EXISTING_SHIFT, for an exact duplicate (a shift trivially overlaps itself)', () => {
    const gate = new FeasibilityGate(input([ALICE]));
    const state = new RosterState();
    const first = gate.eligible('alice', 1, MORNING, state);
    if (first.ok) state.commit(first.eligibility);
    const duplicate = gate.eligible('alice', 1, MORNING, state);
    expect(duplicate.ok).toBe(false);
    if (!duplicate.ok) expect(duplicate.reason).toBe('ALREADY_ASSIGNED');
  });
});

describe('FeasibilityGate — unknown staffId is a caller bug, not a feasibility verdict', () => {
  it('throws rather than returning a reason code', () => {
    const gate = new FeasibilityGate(input([ALICE]));
    expect(() => gate.eligible('ghost', 1, MORNING, new RosterState())).toThrow(/unknown staffId/);
  });
});
