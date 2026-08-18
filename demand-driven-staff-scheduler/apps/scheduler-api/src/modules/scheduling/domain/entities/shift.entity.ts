export interface Shift {
  readonly id: string
  readonly scheduleId: string
  readonly label: string
  /** Minutes from midnight — see docs/04_data_model.md for why not a `TIME` column. */
  readonly startMinute: number
  readonly endMinute: number // endMinute > startMinute (assumption 3, no overnight shifts)
}

/** Seeded on schedule creation — brief §2.4. */
export const DEFAULT_SHIFTS: ReadonlyArray<{
  label: string
  startMinute: number
  endMinute: number
}> = [
  { label: 'Morning', startMinute: 7 * 60, endMinute: 15 * 60 },
  { label: 'Evening', startMinute: 15 * 60, endMinute: 23 * 60 },
]
