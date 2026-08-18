/**
 * Day×hour grid builders — return `Map`s, not nested arrays. `tsconfig.base.json` enables
 * `noUncheckedIndexedAccess`, so a nested-array read (`grid[day][hour]`) would type as
 * `T | undefined` at every call site; a `Map.get` already carries that signature honestly.
 */
import type { Assignment, DemandCell, HourDiagnostic } from './api-client'

/** `(day, hour) -> transactions`, keyed `"day:hour"`. */
export function buildDemandGrid(cells: readonly DemandCell[]): Map<string, number> {
  const grid = new Map<string, number>()
  for (const cell of cells) {
    grid.set(`${cell.dayOfWeek}:${cell.hour}`, cell.transactions)
  }
  return grid
}

export function demandGridKey(day: number, hour: number): string {
  return `${day}:${hour}`
}

/** `(day, shiftId) -> assignments on that cell`. Operates on the persisted, `id`-bearing shape
 *  (`ScheduleDetail.assignments`) so the roster screen can delete what it renders. */
export function buildRosterGrid(assignments: readonly Assignment[]): Map<string, Assignment[]> {
  const grid = new Map<string, Assignment[]>()
  for (const assignment of assignments) {
    const key = rosterGridKey(assignment.dayOfWeek, assignment.shiftId)
    const existing = grid.get(key) ?? []
    existing.push(assignment)
    grid.set(key, existing)
  }
  return grid
}

export function rosterGridKey(day: number, shiftId: string): string {
  return `${day}:${shiftId}`
}

/** `(day, hour) -> HourDiagnostic`, for the coverage screen. */
export function buildCoverageGrid(hours: readonly HourDiagnostic[]): Map<string, HourDiagnostic> {
  const grid = new Map<string, HourDiagnostic>()
  for (const h of hours) {
    grid.set(demandGridKey(h.day, h.hour), h)
  }
  return grid
}

export function maxValue(values: Iterable<number>): number {
  let max = 0
  for (const v of values) if (v > max) max = v
  return max
}
