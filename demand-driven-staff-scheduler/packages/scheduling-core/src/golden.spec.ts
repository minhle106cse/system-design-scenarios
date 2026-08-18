// The golden-file layer (init plan §8.2, phase-1-algorithm.plan.md §4). Snapshots the exact
// roster/summary/diagnostics for the real committed CSV at the seeded parameters (init plan §7.8).
//
// Runs against the HAND-BUILT fixture (test-fixtures/real-demand-grid.ts) rather than the CSV
// importer, because the importer is Phase 2. When Phase 2 lands, its output is asserted identical
// to this fixture (`REAL_TOTAL_TRANSACTIONS` / `REAL_CELL_COUNT`) — that equality check becomes
// the importer's strongest test, and this snapshot's inputs swap over unchanged.
import { describe, expect, it } from 'vitest';
import { generateRoster, summarise, validateRoster } from './index.js';
import { buildRealDemandGrid, REAL_CELL_COUNT, REAL_TOTAL_TRANSACTIONS } from './test-fixtures/real-demand-grid.js';
import type { SchedulingInput, Shift, Staff } from './model/types.js';

const MORNING: Shift = { id: 'morning', label: 'Morning', startMinute: 7 * 60, endMinute: 15 * 60 };
const EVENING: Shift = { id: 'evening', label: 'Evening', startMinute: 15 * 60, endMinute: 23 * 60 };

// The seed team, init plan §7.8: 3×40h · 5×32h · 3×24h · 1×16h = 368 contracted hours. Fixed ids
// so the snapshot is stable across runs.
const SEED_STAFF: Staff[] = [
  { id: 'seed-01', name: 'Alice Nguyen', maxWeeklyHours: 40 },
  { id: 'seed-02', name: 'Ben Tran', maxWeeklyHours: 40 },
  { id: 'seed-03', name: 'Carla Diaz', maxWeeklyHours: 40 },
  { id: 'seed-04', name: 'Duy Pham', maxWeeklyHours: 32 },
  { id: 'seed-05', name: 'Erin Walsh', maxWeeklyHours: 32 },
  { id: 'seed-06', name: 'Farid Khan', maxWeeklyHours: 32 },
  { id: 'seed-07', name: 'Grace Lee', maxWeeklyHours: 32 },
  { id: 'seed-08', name: 'Hoa Le', maxWeeklyHours: 32 },
  { id: 'seed-09', name: 'Ivy Chen', maxWeeklyHours: 24 },
  { id: 'seed-10', name: 'Jack Osei', maxWeeklyHours: 24 },
  { id: 'seed-11', name: 'Kim Vu', maxWeeklyHours: 24 },
  { id: 'seed-12', name: 'Liam Brooks', maxWeeklyHours: 16 },
];

function seedInput(): SchedulingInput {
  return {
    staff: SEED_STAFF,
    shifts: [MORNING, EVENING],
    demand: buildRealDemandGrid(),
    parameters: { transactionsPerStaffHour: 18, minStaffWhenOpen: 1, minUtilisationTarget: 0.6 }, // N=18, the shipped default (D1 Option A)
  };
}

describe('golden file — the real CSV, the seeded team, N=18 (init plan §7.8)', () => {
  it('the fixture itself reproduces the measured figures (init plan §7.1)', () => {
    const grid = buildRealDemandGrid();
    let total = 0;
    let count = 0;
    for (const hours of grid.values()) for (const txn of hours.values()) { total += txn; count++; }
    expect(count).toBe(REAL_CELL_COUNT);
    expect(total).toBe(REAL_TOTAL_TRANSACTIONS);
  });

  it('generateRoster output matches the committed snapshot', () => {
    const input = seedInput();
    const { roster, diagnostics } = generateRoster(input);
    // Sort for a stable, readable snapshot — generation order is already deterministic, but a
    // snapshot should not be coupled to that internal detail any more than it has to be.
    const sortedAssignments = [...roster.assignments].sort((a, b) =>
      a.staffId !== b.staffId ? (a.staffId < b.staffId ? -1 : 1) : a.day !== b.day ? a.day - b.day : a.shiftId < b.shiftId ? -1 : 1,
    );
    expect(sortedAssignments).toMatchSnapshot('roster-assignments');
    expect(diagnostics.structural).toMatchSnapshot('structural-verdict');
    expect(diagnostics.staff).toMatchSnapshot('staff-diagnostics');
  });

  it('re-derives the §7.8 seat/hour arithmetic: 34 floor seats filled where capacity allows, structural verdict 272h floor vs 368h contracted', () => {
    const input = seedInput();
    const { diagnostics } = generateRoster(input);
    expect(diagnostics.structural.floorStaffHours).toBe(272);
    expect(diagnostics.structural.contractedStaffHours).toBe(368);
  });

  it('the generated roster has zero hard-constraint violations', () => {
    const input = seedInput();
    const { roster } = generateRoster(input);
    expect(validateRoster(roster, input)).toEqual([]);
  });

  it('summary week totals match the real dataset', () => {
    const input = seedInput();
    const { roster } = generateRoster(input);
    const summary = summarise(roster, input.demand, input.shifts);
    expect(summary.totalTransactions).toBe(REAL_TOTAL_TRANSACTIONS);
    expect(summary).toMatchSnapshot('summary-report');
  });
});
