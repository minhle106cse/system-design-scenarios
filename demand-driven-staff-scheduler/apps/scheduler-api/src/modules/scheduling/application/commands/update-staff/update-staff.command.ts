import type { ICommand } from '@scheduler/shared-kernel'

export class UpdateStaffCommand implements ICommand {
  readonly name = UpdateStaffCommand.name

  constructor(
    readonly staffId: string,
    readonly staffName: string | undefined,
    readonly maxWeeklyHours: number | undefined,
  ) {}
}
