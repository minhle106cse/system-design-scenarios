import type { ICommand } from '@scheduler/shared-kernel'

export class SetStaffRolesCommand implements ICommand {
  readonly name = SetStaffRolesCommand.name

  constructor(
    readonly staffId: string,
    readonly roleIds: readonly string[],
  ) {}
}
