export interface ScheduleRun {
  readonly id: string
  readonly scheduleId: string
  readonly generatedAt: Date
  readonly parameters: unknown
  readonly diagnostics: unknown
}
