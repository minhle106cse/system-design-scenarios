import type { StaffRole } from '../entities/role.entity'

export interface IStaffRoleRepository {
  listByScheduleId(scheduleId: string): Promise<StaffRole[]>
  /** Replace-the-whole-set for one staff member (matching `importDemand`'s upsert / `autoSchedule`'s
   *  `replaceAll` precedent, assumptions 10/11) — not add/remove-one semantics for a set-shaped resource. */
  setForStaff(staffId: string, roleIds: readonly string[]): Promise<StaffRole[]>
}
