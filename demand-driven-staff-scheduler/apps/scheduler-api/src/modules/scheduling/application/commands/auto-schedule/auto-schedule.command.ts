import type { ICommand } from '@scheduler/shared-kernel'

export class AutoScheduleCommand implements ICommand {
  readonly name = AutoScheduleCommand.name

  constructor(readonly scheduleId: string) {}
}
