import type { ICommand } from '@scheduler/shared-kernel'

export class CancelAppointmentCommand implements ICommand {
  readonly name = CancelAppointmentCommand.name

  constructor(readonly appointmentId: string) {}
}
