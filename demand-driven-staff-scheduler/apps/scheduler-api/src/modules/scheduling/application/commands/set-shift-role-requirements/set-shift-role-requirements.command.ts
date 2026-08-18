import type { ICommand } from '@scheduler/shared-kernel'

export interface RoleRequirementInput {
  readonly roleId: string
  readonly minCount: number
}

export class SetShiftRoleRequirementsCommand implements ICommand {
  readonly name = SetShiftRoleRequirementsCommand.name

  constructor(
    readonly shiftId: string,
    readonly requirements: readonly RoleRequirementInput[],
  ) {}
}
