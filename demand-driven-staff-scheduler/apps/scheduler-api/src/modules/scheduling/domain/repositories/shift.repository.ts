import type { Shift } from '../entities/shift.entity'

export interface CreateShiftData {
  readonly scheduleId: string
  readonly label: string
  readonly startMinute: number
  readonly endMinute: number
}

export interface UpdateShiftData {
  readonly label?: string
  readonly startMinute?: number
  readonly endMinute?: number
}

export interface IShiftRepository {
  create(data: CreateShiftData): Promise<Shift>
  findById(id: string): Promise<Shift | null>
  listByScheduleId(scheduleId: string): Promise<Shift[]>
  update(id: string, data: UpdateShiftData): Promise<Shift>
  softDelete(id: string): Promise<void>
}
