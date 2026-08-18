import type { StaffUnavailability } from '../entities/staff-unavailability.entity'

export interface CreateStaffUnavailabilityData {
  readonly staffId: string
  readonly dayOfWeek: number
  readonly startMinute: number
  readonly endMinute: number
}

export interface IStaffUnavailabilityRepository {
  create(data: CreateStaffUnavailabilityData): Promise<StaffUnavailability>
  findById(id: string): Promise<StaffUnavailability | null>
  listByScheduleId(scheduleId: string): Promise<StaffUnavailability[]>
  /** Hard delete — no `deletedAt` column (schema.prisma), same class as Assignment. */
  delete(id: string): Promise<void>
}
