// Stage 5 / the summary report (init plan §7.7, frozen surface `summarise` — plan §2.3). Kept
// SEPARATE from generateRoster on purpose: it must also work over a manually-edited roster
// (stretch goal), so it takes a plain Roster, not a RosterState.
import { hoursTouchedBy, overlapMinutes } from '../model/hour-range.js';
import type { DayOfWeek, DemandGrid, Roster, Shift, SummaryCell, SummaryReport } from '../model/types.js';

const ALL_DAYS: readonly DayOfWeek[] = [1, 2, 3, 4, 5, 6, 7];
const ALL_HOURS = Array.from({ length: 24 }, (_, h) => h);

function staffHoursGrid(roster: Roster, shifts: readonly Shift[]): Map<DayOfWeek, Map<number, number>> {
  const shiftById = new Map(shifts.map((s) => [s.id, s]));
  const grid = new Map<DayOfWeek, Map<number, number>>();

  for (const a of roster.assignments) {
    const shift = shiftById.get(a.shiftId);
    if (!shift) continue; // an assignment referencing an unknown shift contributes nothing, never throws
    const dayMap = grid.get(a.day) ?? new Map<number, number>();
    for (const h of hoursTouchedBy(shift)) {
      dayMap.set(h, (dayMap.get(h) ?? 0) + overlapMinutes(shift, h) / 60);
    }
    grid.set(a.day, dayMap);
  }

  return grid;
}

/**
 * Per (day, hour): transactions, staffHours, transactions ÷ staffHours (`null` — renders "–" —
 * when staffHours is 0, init plan §7.7). Cells come from the UNION of demand cells and staffed
 * hours, so a shift covering an hour with no demand cell still shows up rather than being
 * silently dropped.
 *
 * The two week-level ratios (init plan §7.7's flagged bug risk, phase-1 plan §2.5):
 *   - transactionsPerStaffHourOverall: Σtxn ÷ ΣstaffHours — WEIGHTED.
 *   - averageTransactionsPerStaffHour: mean of PER-CELL ratios, over cells with staffHours > 0 —
 *     UNWEIGHTED. A cell with staffHours = 0 is excluded from this mean, in addition to (not
 *     instead of) rendering `null` for its own ratio — two separate behaviours, two assertions.
 */
export function summarise(roster: Roster, demand: DemandGrid, shifts: readonly Shift[]): SummaryReport {
  const staffHours = staffHoursGrid(roster, shifts);
  const cells: SummaryCell[] = [];

  for (const day of ALL_DAYS) {
    for (const hour of ALL_HOURS) {
      const transactions = demand.get(day)?.get(hour);
      const hoursStaffed = staffHours.get(day)?.get(hour) ?? 0;
      if (transactions === undefined && hoursStaffed === 0) continue; // neither open nor staffed — no cell

      const txn = transactions ?? 0;
      const ratio = hoursStaffed > 0 ? txn / hoursStaffed : null;
      cells.push({ day, hour, transactions: txn, staffHours: hoursStaffed, transactionsPerStaffHour: ratio });
    }
  }

  const totalTransactions = cells.reduce((sum, c) => sum + c.transactions, 0);
  const totalStaffHours = cells.reduce((sum, c) => sum + c.staffHours, 0);

  const staffedCells = cells.filter((c) => c.staffHours > 0);
  const averageTransactionsPerStaffHour =
    staffedCells.length === 0
      ? null
      : staffedCells.reduce((sum, c) => sum + c.transactionsPerStaffHour!, 0) / staffedCells.length;

  return {
    cells,
    totalStaffHours,
    totalTransactions,
    transactionsPerStaffHourOverall: totalStaffHours > 0 ? totalTransactions / totalStaffHours : null,
    averageTransactionsPerStaffHour,
  };
}
