import type { ICommand } from '@scheduler/shared-kernel'

export class UpdateRoleCommand implements ICommand {
  readonly name = UpdateRoleCommand.name

  constructor(
    readonly roleId: string,
    readonly roleName?: string,
  ) {}
}
