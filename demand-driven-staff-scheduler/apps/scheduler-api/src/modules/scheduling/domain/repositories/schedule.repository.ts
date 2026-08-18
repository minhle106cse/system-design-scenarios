import type { Schedule } from '../entities/schedule.entity'

export interface CreateScheduleData {
  readonly name: string
}

/** All optional — A3's parameter panel (brief §2.5's "the parameter panel", `docs/05`). */
export interface UpdateScheduleData {
  readonly name?: string
  readonly transactionsPerStaffHour?: number
  readonly minStaffWhenOpen?: number
  readonly maxStaffPerHour?: number | null
  readonly minUtilisationTarget?: number
}

export interface IScheduleRepository {
  create(data: CreateScheduleData): Promise<Schedule>
  findById(id: string): Promise<Schedule | null>
  update(id: string, data: UpdateScheduleData): Promise<Schedule>
}
