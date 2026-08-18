// Hand-built from sample-data/report_Transaction_20260807_20260813.csv (the committed real file),
// transcribed by hand rather than parsed — the importer itself is Phase 2 (init plan §4). This
// fixture is what phase-1-algorithm.plan.md §4 calls "a hand-built DemandGrid fixture derived from
// the CSV's 112 cells"; Phase 2 swaps the importer's real output in and asserts it's identical to
// this, which becomes the importer's strongest test.
//
// Verified reproducing init plan §7.1 exactly: 112 cells, 3,058 total, peak 64 (Fri 1pm), min 2
// (Tue 10pm), busiest hour 1pm=329, quietest 10pm=37, day totals Sat 508 · Thu 470 · Tue 453 ·
// Fri 452 · Wed 393 · Mon 392 · Sun 390 (phase-1-algorithm.plan.md §0).
import type { DayOfWeek, DemandGrid } from '../model/types.js';

// CSV column order is Fri..Thu (assumption 8 — matched by weekday token, never position).
// DayOfWeek: 1=Mon .. 7=Sun.
const COLUMN_DAYS: readonly DayOfWeek[] = [5, 6, 7, 1, 2, 3, 4]; // Fri Sat Sun Mon Tue Wed Thu

// hour label -> 24h hour number, in the CSV's row order (7am..10pm).
const ROWS: ReadonlyArray<{ hour: number; values: readonly number[] }> = [
  { hour: 7, values: [22, 13, 7, 12, 22, 13, 16] },
  { hour: 8, values: [25, 44, 32, 32, 35, 33, 45] },
  { hour: 9, values: [27, 57, 41, 39, 48, 32, 49] },
  { hour: 10, values: [38, 41, 42, 35, 41, 28, 41] },
  { hour: 11, values: [40, 42, 37, 32, 30, 33, 40] },
  { hour: 12, values: [25, 47, 30, 33, 52, 33, 40] },
  { hour: 13, values: [64, 44, 38, 45, 48, 45, 45] },
  { hour: 14, values: [42, 37, 18, 45, 33, 31, 34] },
  { hour: 15, values: [30, 37, 22, 25, 22, 25, 23] },
  { hour: 16, values: [19, 27, 28, 13, 14, 14, 14] },
  { hour: 17, values: [27, 21, 19, 18, 22, 34, 20] },
  { hour: 18, values: [18, 21, 16, 19, 24, 19, 20] },
  { hour: 19, values: [24, 31, 22, 18, 25, 22, 33] },
  { hour: 20, values: [34, 34, 24, 15, 26, 15, 32] },
  { hour: 21, values: [12, 7, 8, 4, 9, 10, 12] },
  { hour: 22, values: [5, 5, 6, 7, 2, 6, 6] },
];

export function buildRealDemandGrid(): DemandGrid {
  const grid = new Map<DayOfWeek, Map<number, number>>();
  for (const day of COLUMN_DAYS) grid.set(day, new Map());

  for (const { hour, values } of ROWS) {
    values.forEach((transactions, i) => {
      const day = COLUMN_DAYS[i]!;
      grid.get(day)!.set(hour, transactions);
    });
  }

  return grid;
}

export const REAL_TOTAL_TRANSACTIONS = 3058;
export const REAL_CELL_COUNT = 112;
