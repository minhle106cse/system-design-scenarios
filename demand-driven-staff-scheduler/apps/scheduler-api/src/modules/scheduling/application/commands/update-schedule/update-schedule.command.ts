import type { ICommand } from '@scheduler/shared-kernel'
import type { UpdateScheduleData } from '../../../domain/repositories/schedule.repository'

export class UpdateScheduleCommand implements ICommand {
  readonly name = UpdateScheduleCommand.name

  constructor(
    readonly scheduleId: string,
    readonly data: UpdateScheduleData,
  ) {}
}
