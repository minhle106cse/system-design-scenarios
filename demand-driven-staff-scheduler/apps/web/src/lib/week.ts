/** Week-shaped formatting helpers — day-of-week is `1 = Monday .. 7 = Sunday` on the wire
 *  (`api-client.ts`'s `DemandCell`/`Assignment`), matching the brief's Mon–Sun schedule. */

export const DAY_LABELS: Readonly<Record<number, string>> = {
  1: 'Mon',
  2: 'Tue',
  3: 'Wed',
  4: 'Thu',
  5: 'Fri',
  6: 'Sat',
  7: 'Sun',
}

export const DAYS_OF_WEEK: readonly number[] = [1, 2, 3, 4, 5, 6, 7]

export function dayLabel(day: number): string {
  return DAY_LABELS[day] ?? `Day ${day}`
}

/** `420 -> '07:00'` — minutes-from-midnight, this repo's shift/wire format (assumption 4). */
export function formatMinutes(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

/** `'07:00' -> 420`. Returns `null` on anything that isn't `HH:mm`, so a caller can show a field
 *  error instead of silently coercing to `NaN` (`frontend_standard.md` §1 rule 3). */
export function parseTime(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim())
  if (!match) return null
  const [, h, m] = match
  const hours = Number(h)
  const minutes = Number(m)
  if (hours > 23 || minutes > 59) return null
  return hours * 60 + minutes
}

export function shiftHours(shift: {
  readonly startMinute: number
  readonly endMinute: number
}): number {
  return (shift.endMinute - shift.startMinute) / 60
}
