export interface StaffUnavailability {
  readonly id: string
  readonly staffId: string
  readonly dayOfWeek: number
  readonly startMinute: number
  readonly endMinute: number
}
