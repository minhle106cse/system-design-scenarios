import type { ICommand } from '@scheduler/shared-kernel'

export class UpdateShiftCommand implements ICommand {
  readonly name = UpdateShiftCommand.name

  constructor(
    readonly shiftId: string,
    readonly label: string | undefined,
    readonly startMinute: number | undefined,
    readonly endMinute: number | undefined,
  ) {}
}
