import type { IQuery } from '@scheduler/shared-kernel'

export class GetAppointmentQuery implements IQuery {
  readonly name = GetAppointmentQuery.name

  constructor(readonly appointmentId: string) {}
}
