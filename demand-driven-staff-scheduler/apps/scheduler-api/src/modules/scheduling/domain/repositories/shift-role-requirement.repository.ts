import type { ShiftRoleRequirement } from '../entities/role.entity'

export interface ShiftRoleRequirementInput {
  readonly roleId: string
  readonly minCount: number
}

export interface IShiftRoleRequirementRepository {
  listByScheduleId(scheduleId: string): Promise<ShiftRoleRequirement[]>
  /** Replace-the-whole-set for one shift — same reasoning as `IStaffRoleRepository.setForStaff`. */
  setForShift(
    shiftId: string,
    requirements: readonly ShiftRoleRequirementInput[],
  ): Promise<ShiftRoleRequirement[]>
}
