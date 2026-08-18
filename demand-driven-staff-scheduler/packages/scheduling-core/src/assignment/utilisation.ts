// Shared utilisation arithmetic (assigner.ts and rebalancer.ts both need it, and reporting/
// diagnostics.ts needs the same NaN-safe definition — kept in one place so the three can't drift).
import type { RosterState } from './feasibility-gate.js';
import type { Staff } from '../model/types.js';

/**
 * assignedHours / maxWeeklyHours. `maxWeeklyHours === 0` ⇒ `1` (fully "utilised"), never `NaN` —
 * a person contracted for zero hours is not under-utilised (phase-1 plan §2.5). This is also the
 * safe case for ranking: FeasibilityGate's H1 always blocks a `maxWeeklyHours === 0` staff member
 * from ever being assigned anything, so a real assigned-hours value here would never be nonzero,
 * but the formula stays defined regardless of call order.
 */
export function utilisationOf(staff: Staff, state: RosterState): number {
  if (staff.maxWeeklyHours === 0) return 1;
  return state.hours(staff.id) / staff.maxWeeklyHours;
}

/** Deterministic tie-break used everywhere staff are ranked — never insertion order, never random. */
export function compareByNameThenId(a: Staff, b: Staff): number {
  if (a.name !== b.name) return a.name < b.name ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
