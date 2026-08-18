import type { ICommand } from '@scheduler/shared-kernel'

export class AddRoleCommand implements ICommand {
  readonly name = AddRoleCommand.name

  constructor(
    readonly scheduleId: string,
    readonly roleName: string,
  ) {}
}
