// Stage 2 — required per hour → headcount per shift (init plan §7.3, phase-1 plan §2.2).
import { hoursTouchedBy } from '../model/hour-range.js';
import type { DayOfWeek, RequiredGrid, Shift, ShiftHeadcount, ShiftId, ShiftRequirements } from '../model/types.js';

const ALL_DAYS: readonly DayOfWeek[] = [1, 2, 3, 4, 5, 6, 7];

/**
 * floor[d][s]  = ceil(mean(required[d][h] for h in hoursTouchedBy(s)))  — never leave the shift thin
 * target[d][s] = max (required[d][h] for h in hoursTouchedBy(s))        — cover the peak
 *
 * "h in s" is ANY overlap of at least one minute (hoursTouchedBy), not "hours fully contained" —
 * pinned deliberately (phase-1 plan §2.2): invisible for the two seeded whole-hour shifts, but
 * changes every number the moment a shift starts at :30.
 *
 * Overlapping shifts (init plan §7.3): processed in startMinute order (ties broken by endMinute,
 * then id — never array order), each later shift's mean/max computed over what EARLIER shifts have
 * not already committed for that hour — `Math.max(0, required - alreadyCommitted)`. Two whole-day
 * shifts covering the same hours would otherwise double-count that hour's headcount need.
 *
 * Pinned edge cases (phase-1 plan §2.2):
 * - A zero-length or sub-hour shift (`hoursTouchedBy` = []) → floor = target = 0, not NaN
 *   (`mean([])` is `NaN` — this is init plan §8.1's degenerate case "a shift covering no whole hour").
 * - An hour the store is closed (absent from `required[day]`) contributes 0 to the mean — this
 *   LOWERS floor rather than being excluded; the two behaviours differ and this is the chosen one.
 * - A day entirely absent from `required` (no demand cells at all) is treated as fully closed —
 *   every shift on it gets floor = target = 0.
 */
export function computeShiftRequirements(required: RequiredGrid, shifts: readonly Shift[]): ShiftRequirements {
  const orderedShifts = [...shifts].sort((a, b) => {
    if (a.startMinute !== b.startMinute) return a.startMinute - b.startMinute;
    if (a.endMinute !== b.endMinute) return a.endMinute - b.endMinute;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  const result = new Map<DayOfWeek, Map<ShiftId, ShiftHeadcount>>();

  for (const day of ALL_DAYS) {
    const dayRequired = required.get(day);
    const committed = new Map<number, number>(); // hour -> headcount already claimed by an earlier shift
    const dayResult = new Map<ShiftId, ShiftHeadcount>();

    for (const shift of orderedShifts) {
      const hours = hoursTouchedBy(shift);

      if (hours.length === 0) {
        dayResult.set(shift.id, { floor: 0, target: 0 });
        continue;
      }

      const remaining = hours.map((h) => {
        const need = dayRequired?.get(h) ?? 0; // closed hour ⇒ 0, lowers the mean deliberately
        const already = committed.get(h) ?? 0;
        return Math.max(0, need - already);
      });

      const mean = remaining.reduce((sum, v) => sum + v, 0) / remaining.length;
      const floor = Math.ceil(mean);
      const target = Math.max(...remaining);
      dayResult.set(shift.id, { floor, target });

      for (const h of hours) committed.set(h, (committed.get(h) ?? 0) + floor);
    }

    result.set(day, dayResult);
  }

  return result;
}
