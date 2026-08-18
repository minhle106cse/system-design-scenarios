export type AssignmentSource = 'AUTO' | 'MANUAL'

export interface Assignment {
  readonly id: string
  readonly scheduleId: string
  readonly staffId: string
  readonly shiftId: string
  readonly dayOfWeek: number
  readonly source: AssignmentSource
}
