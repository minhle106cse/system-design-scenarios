import type { ICommand } from '@scheduler/shared-kernel'

export class AddUnavailabilityCommand implements ICommand {
  readonly name = AddUnavailabilityCommand.name

  constructor(
    readonly staffId: string,
    readonly dayOfWeek: number,
    readonly startMinute: number,
    readonly endMinute: number,
  ) {}
}
