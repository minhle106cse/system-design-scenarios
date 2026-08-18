import type { ICommand } from '@scheduler/shared-kernel'

export class RemoveUnavailabilityCommand implements ICommand {
  readonly name = RemoveUnavailabilityCommand.name

  constructor(readonly windowId: string) {}
}
