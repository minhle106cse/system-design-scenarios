import type { ICommand } from '@scheduler/shared-kernel'

export class RemoveStaffCommand implements ICommand {
  readonly name = RemoveStaffCommand.name

  constructor(readonly staffId: string) {}
}
