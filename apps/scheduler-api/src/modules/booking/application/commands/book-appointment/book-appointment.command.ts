import type { ICommand } from '@scheduler/shared-kernel'

export class BookAppointmentCommand implements ICommand {
  // Must equal the class name — CqrsModule's discovery registers handlers by
  // this value at `command.name`, not by the decorator argument's identity.
  readonly name = BookAppointmentCommand.name

  constructor(
    readonly customerId: string,
    readonly vehicleId: string,
    readonly dealershipId: string,
    readonly serviceTypeId: string,
    readonly startAt: Date,
  ) {}
}
