import type { Schedule } from '../entities/schedule.entity'

export interface CreateScheduleData {
  readonly name: string
}

export interface IScheduleRepository {
  create(data: CreateScheduleData): Promise<Schedule>
  findById(id: string): Promise<Schedule | null>
  findAll(): Promise<Schedule[]>
}
