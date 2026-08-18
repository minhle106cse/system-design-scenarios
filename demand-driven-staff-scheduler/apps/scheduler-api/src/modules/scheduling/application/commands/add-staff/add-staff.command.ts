import type { ICommand } from '@scheduler/shared-kernel'

export class AddStaffCommand implements ICommand {
  readonly name = AddStaffCommand.name

  constructor(
    readonly scheduleId: string,
    readonly staffName: string,
    readonly maxWeeklyHours: number,
  ) {}
}
