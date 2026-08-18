import type { StaffMember } from '../entities/staff-member.entity'

export interface CreateStaffMemberData {
  readonly scheduleId: string
  readonly name: string
  readonly maxWeeklyHours: number
}

export interface UpdateStaffMemberData {
  readonly name?: string
  readonly maxWeeklyHours?: number
}

export interface IStaffMemberRepository {
  create(data: CreateStaffMemberData): Promise<StaffMember>
  findById(id: string): Promise<StaffMember | null>
  listByScheduleId(scheduleId: string): Promise<StaffMember[]>
  update(id: string, data: UpdateStaffMemberData): Promise<StaffMember>
  softDelete(id: string): Promise<void>
}
