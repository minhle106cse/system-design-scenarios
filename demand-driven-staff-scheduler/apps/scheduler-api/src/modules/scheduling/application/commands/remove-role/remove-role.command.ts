import type { ICommand } from '@scheduler/shared-kernel'

export class RemoveRoleCommand implements ICommand {
  readonly name = RemoveRoleCommand.name

  constructor(readonly roleId: string) {}
}
