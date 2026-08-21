import { Inject, Injectable } from '@nestjs/common'
import type { IQueryHandler } from '@scheduler/shared-kernel'
import { QueryHandler } from '@/infrastructure/cqrs/decorators/query-handler.decorator'
import { AppointmentNotFoundError } from '@/common/errors/booking.error'
import type { AppointmentDto } from '../booking.dto'
import {
  BOOKING_QUERY_REPOSITORY,
  type IBookingQueryRepository,
} from '../../repositories/booking.query-repository'
import { GetAppointmentQuery } from './get-appointment.query'

/**
 * Reads back the record requirement 3 is about
 * (`docs/01_business_requirements.md`) — until this existed, an appointment
 * could be created and cancelled but never fetched, so the persistent record
 * was invisible to every client and to the cURL walkthrough that had just
 * created one.
 *
 * A query, so: no transaction, and it reads through `IBookingQueryRepository`
 * on the plain client (`directives/cqrs_pattern.md` §2). Nothing here decides
 * a write, so there is nothing to keep transactionally consistent — the rule
 * that sends `BookAppointmentHandler` through the write repositories does not
 * apply to a read that hands its result straight back to the client.
 */
@Injectable()
@QueryHandler(GetAppointmentQuery)
export class GetAppointmentHandler implements IQueryHandler<GetAppointmentQuery, AppointmentDto> {
  constructor(@Inject(BOOKING_QUERY_REPOSITORY) private readonly repo: IBookingQueryRepository) {}

  async execute(query: GetAppointmentQuery): Promise<AppointmentDto> {
    const appointment = await this.repo.findAppointmentById(query.appointmentId)
    if (!appointment) throw new AppointmentNotFoundError(query.appointmentId)

    // Trust on read (`directives/domain_modeling.md` §2): the row was validated
    // on the way in, so this maps rather than re-checks. `Date -> ISO string`
    // is the only transformation, and it is the same one both write handlers
    // apply, which is what keeps all three routes on one response schema.
    return {
      id: appointment.id,
      status: appointment.status,
      startAt: appointment.startAt.toISOString(),
      endAt: appointment.endAt.toISOString(),
      serviceBay: { id: appointment.serviceBay.id, label: appointment.serviceBay.label },
      technician: { id: appointment.technician.id, name: appointment.technician.name },
    }
  }
}
