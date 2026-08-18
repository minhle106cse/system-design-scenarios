import type { ICommand } from '@scheduler/shared-kernel'

export class AddShiftCommand implements ICommand {
  readonly name = AddShiftCommand.name

  constructor(
    readonly scheduleId: string,
    readonly label: string,
    readonly startMinute: number,
    readonly endMinute: number,
  ) {}
}
