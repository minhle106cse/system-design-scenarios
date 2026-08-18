/** Availability/day-off formatting (brief §8 stretch, H4) — `frontend_standard.md`'s no-jsdom
 *  convention: non-trivial logic goes here, unit-tested, rather than inline in a component. */
import type { StaffUnavailability } from './api-client'
import { dayLabel, formatMinutes } from './week'

export const DAY_OFF_MINUTES = { startMinute: 0, endMinute: 24 * 60 } as const

/** A window spanning the whole day, midnight to midnight — the UI's "Day off" preset. */
export function isDayOff(window: {
  readonly startMinute: number
  readonly endMinute: number
}): boolean {
  return (
    window.startMinute === DAY_OFF_MINUTES.startMinute &&
    window.endMinute === DAY_OFF_MINUTES.endMinute
  )
}

/** `{day: 2, startMinute: 0, endMinute: 1440}` -> `"Tue: day off"`; a partial window ->
 *  `"Wed 15:00–23:00"`. */
export function formatWindow(window: StaffUnavailability): string {
  const day = dayLabel(window.dayOfWeek)
  if (isDayOff(window)) return `${day}: day off`
  return `${day} ${formatMinutes(window.startMinute)}–${formatMinutes(window.endMinute)}`
}

export function windowsForStaff(
  unavailability: readonly StaffUnavailability[],
  staffId: string,
): readonly StaffUnavailability[] {
  return unavailability.filter((w) => w.staffId === staffId)
}
