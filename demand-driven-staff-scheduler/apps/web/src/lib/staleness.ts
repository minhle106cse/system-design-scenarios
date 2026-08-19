import type { Schedule, ScheduleRun } from './api-client'

/** What auto-schedule stores in `ScheduleRun.parameters` (see `AutoScheduleHandler`). */
interface RunParameters {
  readonly transactionsPerStaffHour?: number
  readonly minStaffWhenOpen?: number
  readonly maxStaffPerHour?: number
  readonly minUtilisationTarget?: number
}

export type RosterStatus =
  | { readonly kind: 'NEVER_RUN' }
  | { readonly kind: 'STALE'; readonly changed: readonly string[] }
  | { readonly kind: 'CURRENT' }

const LABELS: Record<keyof RunParameters, string> = {
  transactionsPerStaffHour: 'Transactions per staff hour (N)',
  minStaffWhenOpen: 'Min staff when open',
  maxStaffPerHour: 'Max staff per hour',
  minUtilisationTarget: 'Fair-share target',
}

/**
 * Is the persisted roster still the answer to the parameters currently on the schedule?
 *
 * This exists because the two derived screens are NOT equally sensitive to a parameter change, and
 * that asymmetry is exactly what made the UI confusing. Coverage's `required` column is recomputed
 * from `demand ÷ N` on every read, so editing N silently moved those numbers even though nothing
 * had been re-planned; the summary's staff-hours, by contrast, come only from the roster and did
 * not move at all. Same edit, two different-looking reactions, no explanation on screen.
 *
 * Rather than freezing the reads (which would mean a manager who edits N can no longer see the
 * coverage of the roster they currently have), the screens now say plainly that the roster predates
 * the current parameters and offer the one action that resolves it — re-running auto-schedule.
 *
 * `maxStaffPerHour` is compared through `?? null` because "no cap" is absent in the stored run but
 * `null` on the schedule row — a raw `!==` would report a change on every single read.
 */
export function rosterStatus(schedule: Schedule, latestRun: ScheduleRun | null): RosterStatus {
  if (!latestRun) return { kind: 'NEVER_RUN' }

  const ran = (latestRun.parameters ?? {}) as RunParameters
  const changed: string[] = []

  const compare = (key: keyof RunParameters, current: number | null) => {
    const before = ran[key] ?? null
    if (before !== current) changed.push(LABELS[key])
  }

  compare('transactionsPerStaffHour', schedule.transactionsPerStaffHour)
  compare('minStaffWhenOpen', schedule.minStaffWhenOpen)
  compare('maxStaffPerHour', schedule.maxStaffPerHour ?? null)
  compare('minUtilisationTarget', schedule.minUtilisationTarget)

  return changed.length > 0 ? { kind: 'STALE', changed } : { kind: 'CURRENT' }
}
