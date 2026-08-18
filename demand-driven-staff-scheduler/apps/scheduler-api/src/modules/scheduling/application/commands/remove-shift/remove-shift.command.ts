import type { ICommand } from '@scheduler/shared-kernel'

export class RemoveShiftCommand implements ICommand {
  readonly name = RemoveShiftCommand.name

  constructor(readonly shiftId: string) {}
}
