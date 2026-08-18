export interface DemandCell {
  readonly id: string
  readonly scheduleId: string
  readonly dayOfWeek: number // 1 = Monday .. 7 = Sunday
  readonly hour: number // 0-23
  readonly transactions: number
}
