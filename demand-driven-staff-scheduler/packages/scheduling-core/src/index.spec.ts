import { describe, expect, it } from 'vitest';
import * as core from './index.js';
import { buildRealDemandGrid } from './test-fixtures/real-demand-grid.js';
import type { SchedulingInput, Shift, Staff } from './model/types.js';

const MORNING: Shift = { id: 'morning', label: 'Morning', startMinute: 7 * 60, endMinute: 15 * 60 };
const EVENING: Shift = { id: 'evening', label: 'Evening', startMinute: 15 * 60, endMinute: 23 * 60 };

// The seed team, init plan §7.8: 3×40h · 5×32h · 3×24h · 1×16h = 368 contracted hours.
const SEED_STAFF: Staff[] = [
  ...Array.from({ length: 3 }, (_, i) => ({ id: `s40-${i}`, name: `Forty ${i}`, maxWeeklyHours: 40 })),
  ...Array.from({ length: 5 }, (_, i) => ({ id: `s32-${i}`, name: `ThirtyTwo ${i}`, maxWeeklyHours: 32 })),
  ...Array.from({ length: 3 }, (_, i) => ({ id: `s24-${i}`, name: `TwentyFour ${i}`, maxWeeklyHours: 24 })),
  { id: 's16-0', name: 'Sixteen 0', maxWeeklyHours: 16 },
];

describe('scheduling-core public surface (Phase 1 — wired)', () => {
  it('exposes exactly the four frozen entry points', () => {
    expect(typeof core.generateRoster).toBe('function');
    expect(typeof core.summarise).toBe('function');
    expect(typeof core.suggestTransactionsPerStaff).toBe('function');
    expect(typeof core.validateRoster).toBe('function');
  });

  it('generateRoster produces a roster that validateRoster confirms has zero violations', () => {
    const input: SchedulingInput = {
      staff: SEED_STAFF,
      shifts: [MORNING, EVENING],
      demand: buildRealDemandGrid(),
      parameters: { transactionsPerStaffHour: 18, minStaffWhenOpen: 1, minUtilisationTarget: 0.6 },
    };
    const result = core.generateRoster(input);
    expect(result.roster.assignments.length).toBeGreaterThan(0);
    expect(core.validateRoster(result.roster, input)).toEqual([]);
  });

  it('generateRoster is deterministic — same input twice → structurally equal roster', () => {
    const input: SchedulingInput = {
      staff: SEED_STAFF,
      shifts: [MORNING, EVENING],
      demand: buildRealDemandGrid(),
      parameters: { transactionsPerStaffHour: 18, minStaffWhenOpen: 1, minUtilisationTarget: 0.6 },
    };
    const a = core.generateRoster(input);
    const b = core.generateRoster(input);
    expect(a.roster).toEqual(b.roster);
  });

  it('summarise works over the output of generateRoster', () => {
    const input: SchedulingInput = {
      staff: SEED_STAFF,
      shifts: [MORNING, EVENING],
      demand: buildRealDemandGrid(),
      parameters: { transactionsPerStaffHour: 18, minStaffWhenOpen: 1, minUtilisationTarget: 0.6 },
    };
    const { roster } = core.generateRoster(input);
    const summary = core.summarise(roster, input.demand, input.shifts);
    expect(summary.totalTransactions).toBe(3058);
  });

  it("suggestTransactionsPerStaff returns 15 for the seed team against the real CSV (phase-1 plan D1 — NOT 18, the shipped default)", () => {
    const N = core.suggestTransactionsPerStaff(buildRealDemandGrid(), SEED_STAFF, [MORNING, EVENING]);
    expect(N).toBe(15);
  });

  it('validateRoster reports a violation for an assignment referencing an unknown shift, never throws', () => {
    const input: SchedulingInput = {
      staff: SEED_STAFF,
      shifts: [MORNING],
      demand: new Map(),
      parameters: { transactionsPerStaffHour: 18, minStaffWhenOpen: 1, minUtilisationTarget: 0.6 },
    };
    const roster = { assignments: [{ staffId: SEED_STAFF[0]!.id, shiftId: 'ghost-shift', day: 1 as const, source: 'MANUAL' as const }] };
    const violations = core.validateRoster(roster, input);
    expect(violations).toHaveLength(1);
    expect(violations[0]!.reason).toBe('UNAVAILABLE');
  });

  it('validateRoster catches a manually-introduced overlap (assumption 12)', () => {
    const input: SchedulingInput = {
      staff: [SEED_STAFF[0]!],
      shifts: [MORNING, { id: 'late', label: 'Late', startMinute: 14 * 60, endMinute: 22 * 60 }],
      demand: new Map(),
      parameters: { transactionsPerStaffHour: 18, minStaffWhenOpen: 1, minUtilisationTarget: 0.6 },
    };
    const roster = {
      assignments: [
        { staffId: SEED_STAFF[0]!.id, shiftId: 'morning', day: 1 as const, source: 'MANUAL' as const },
        { staffId: SEED_STAFF[0]!.id, shiftId: 'late', day: 1 as const, source: 'MANUAL' as const }, // overlaps morning
      ],
    };
    const violations = core.validateRoster(roster, input);
    expect(violations).toHaveLength(1);
    expect(violations[0]!.reason).toBe('OVERLAPS_EXISTING_SHIFT');
  });
});
