import type { ICommand } from '@scheduler/shared-kernel'
import type { DayOfWeek } from '@scheduler/scheduling-core'

export class AddAssignmentCommand implements ICommand {
  readonly name = AddAssignmentCommand.name

  constructor(
    readonly scheduleId: string,
    readonly staffId: string,
    readonly shiftId: string,
    readonly dayOfWeek: DayOfWeek,
  ) {}
}
