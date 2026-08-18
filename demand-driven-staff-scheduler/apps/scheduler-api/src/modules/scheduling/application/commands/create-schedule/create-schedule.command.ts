import type { ICommand } from '@scheduler/shared-kernel'

export class CreateScheduleCommand implements ICommand {
  readonly name = CreateScheduleCommand.name

  constructor(readonly scheduleName: string) {}
}
