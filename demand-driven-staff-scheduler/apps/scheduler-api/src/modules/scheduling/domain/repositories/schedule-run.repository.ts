import type { ScheduleRun } from '../entities/schedule-run.entity'

export interface CreateScheduleRunData {
  readonly scheduleId: string
  readonly parameters: unknown
  readonly diagnostics: unknown
}

export interface IScheduleRunRepository {
  create(data: CreateScheduleRunData): Promise<ScheduleRun>
  findLatestByScheduleId(scheduleId: string): Promise<ScheduleRun | null>
}
