import type { ICommand } from '@scheduler/shared-kernel'
import type { DayOfWeek } from '@scheduler/scheduling-core'

export class MoveAssignmentCommand implements ICommand {
  readonly name = MoveAssignmentCommand.name

  constructor(
    readonly scheduleId: string,
    readonly assignmentId: string,
    readonly shiftId: string,
    readonly dayOfWeek: DayOfWeek,
  ) {}
}
