export interface Role {
  readonly id: string
  readonly scheduleId: string
  readonly name: string
}

export interface StaffRole {
  readonly id: string
  readonly staffId: string
  readonly roleId: string
}

export interface ShiftRoleRequirement {
  readonly id: string
  readonly shiftId: string
  readonly roleId: string
  readonly minCount: number
}
