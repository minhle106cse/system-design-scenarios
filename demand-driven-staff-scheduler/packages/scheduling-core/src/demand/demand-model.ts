// Stage 1 — demand → required staff (init plan §7.2, phase-1 plan §2.1).
import type { DayOfWeek, DemandGrid, RequiredGrid, SchedulingParameters } from '../model/types.js';

/**
 * required[d][h] = clamp(ceil(txn/N), minStaffWhenOpen, maxStaffPerHour) when a demand cell
 * exists for (d,h); 0 otherwise ("open" ⟺ a demand cell exists — assumption 2, never
 * minStaffWhenOpen for a closed hour).
 *
 * Pinned edge cases (phase-1 plan §2.1 — each asserted by name in demand-model.spec.ts):
 * - N <= 0: treated as "one staff per transaction" (N clamped to a minimum of 1) rather than
 *   dividing by zero or producing Infinity, which would silently poison every downstream sum.
 * - maxStaffPerHour < minStaffWhenOpen: maxStaffPerHour wins — a floor bigger than the room is
 *   not satisfiable, and stage 5 reports it. Achieved by clamping to minStaffWhenOpen FIRST, then
 *   capping at maxStaffPerHour last, so the smaller cap always has the final word.
 * - transactions === 0 in an existing cell: still open, so minStaffWhenOpen, not 0.
 */
export function computeRequiredStaff(demand: DemandGrid, params: SchedulingParameters): RequiredGrid {
  const effectiveN = params.transactionsPerStaffHour > 0 ? params.transactionsPerStaffHour : 1;
  const result = new Map<DayOfWeek, Map<number, number>>();

  for (const [day, hours] of demand) {
    const dayRow = new Map<number, number>();
    for (const [hour, transactions] of hours) {
      const raw = Math.ceil(transactions / effectiveN);
      const flooredAtMin = Math.max(raw, params.minStaffWhenOpen);
      const cappedAtMax =
        params.maxStaffPerHour === undefined ? flooredAtMin : Math.min(flooredAtMin, params.maxStaffPerHour);
      dayRow.set(hour, cappedAtMax);
    }
    result.set(day, dayRow);
  }

  return result;
}
