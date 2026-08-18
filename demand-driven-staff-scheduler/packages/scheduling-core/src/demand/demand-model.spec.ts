import { describe, expect, it } from 'vitest';
import { computeRequiredStaff } from './demand-model.js';
import { buildRealDemandGrid } from '../test-fixtures/real-demand-grid.js';
import type { DemandGrid, SchedulingParameters } from '../model/types.js';

function sumRequired(grid: ReturnType<typeof computeRequiredStaff>): number {
  let total = 0;
  for (const hours of grid.values()) for (const v of hours.values()) total += v;
  return total;
}

function params(overrides: Partial<SchedulingParameters> = {}): SchedulingParameters {
  return {
    transactionsPerStaffHour: 18,
    minStaffWhenOpen: 1,
    minUtilisationTarget: 0.6,
    ...overrides,
  };
}

describe('computeRequiredStaff — re-derives init plan §7.2', () => {
  const grid = buildRealDemandGrid();

  it.each([
    [10, 361],
    [12, 306],
    [15, 257],
    [18, 226],
    [20, 210],
    [25, 173],
    [30, 162],
  ])('N=%i → %i required staff-hours', (N, expected) => {
    const result = computeRequiredStaff(grid, params({ transactionsPerStaffHour: N }));
    expect(sumRequired(result)).toBe(expected);
  });
});

describe('computeRequiredStaff — pinned edge cases (phase-1 plan §2.1)', () => {
  it('a closed hour (no demand cell) is absent from the grid, never minStaffWhenOpen', () => {
    const demand: DemandGrid = new Map([[1, new Map([[9, 20]])]]); // only hour 9 is open on Monday
    const result = computeRequiredStaff(demand, params());
    expect(result.get(1)!.has(10)).toBe(false);
  });

  it('transactions === 0 in an existing cell still gets minStaffWhenOpen, not 0', () => {
    const demand: DemandGrid = new Map([[1, new Map([[9, 0]])]]);
    const result = computeRequiredStaff(demand, params({ minStaffWhenOpen: 2 }));
    expect(result.get(1)!.get(9)).toBe(2);
  });

  it('N <= 0 does not divide by zero or produce Infinity/NaN — treated as N=1', () => {
    const demand: DemandGrid = new Map([[1, new Map([[9, 7]])]]);
    const result = computeRequiredStaff(demand, params({ transactionsPerStaffHour: 0 }));
    const value = result.get(1)!.get(9)!;
    expect(Number.isFinite(value)).toBe(true);
    expect(value).toBe(7); // ceil(7/1)

    const negative = computeRequiredStaff(demand, params({ transactionsPerStaffHour: -5 }));
    expect(negative.get(1)!.get(9)).toBe(7);
  });

  it('maxStaffPerHour < minStaffWhenOpen: maxStaffPerHour wins (the smaller cap has the final word)', () => {
    const demand: DemandGrid = new Map([[1, new Map([[9, 100]])]]); // would otherwise require many staff
    const result = computeRequiredStaff(
      demand,
      params({ minStaffWhenOpen: 5, maxStaffPerHour: 2, transactionsPerStaffHour: 1 }),
    );
    expect(result.get(1)!.get(9)).toBe(2);
  });

  it('respects maxStaffPerHour as a normal ceiling when it is above minStaffWhenOpen', () => {
    const demand: DemandGrid = new Map([[1, new Map([[9, 100]])]]);
    const result = computeRequiredStaff(demand, params({ maxStaffPerHour: 4, transactionsPerStaffHour: 1 }));
    expect(result.get(1)!.get(9)).toBe(4);
  });
});
