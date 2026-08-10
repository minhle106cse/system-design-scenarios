import { Module } from '@nestjs/common'
import { AppointmentsController } from './presentation/controllers/appointments.controller'
import { AvailabilityController } from './presentation/controllers/availability.controller'
import { BookAppointmentHandler } from './application/commands/book-appointment/book-appointment.handler'
import { CancelAppointmentHandler } from './application/commands/cancel-appointment/cancel-appointment.handler'
import { CheckAvailabilityHandler } from './application/queries/check-availability/check-availability.handler'
import { BusinessHoursConfig } from './application/business-hours.config'
import { BOOKING_QUERY_REPOSITORY } from './application/queries/booking.query-repository'
import { PrismaBookingQueryRepository } from './infrastructure/repositories/prisma-booking.query-repository'

/**
 * Registers the booking domain with Nest's DI so `CqrsModule`'s
 * `DiscoveryService` can find the command/query handlers (discovery only sees
 * DI providers — `infrastructure/cqrs/cqrs.module.ts`), and so the two
 * controllers below are mounted.
 *
 * The write-side repositories (`appointments`, `serviceBays`, `technicians`,
 * `serviceTypes` on `SchedulerApiRepos`) are NOT providers here — they are
 * constructed per-transaction by `SchedulerApiRepoFactory`
 * (`directives/cqrs_pattern.md` §1). Only the query-side reader
 * (`PrismaBookingQueryRepository`, on the plain client) is a provider, behind
 * the `BOOKING_QUERY_REPOSITORY` token since `IBookingQueryRepository` is an
 * interface and erases at runtime.
 */
@Module({
  controllers: [AppointmentsController, AvailabilityController],
  providers: [
    BookAppointmentHandler,
    CancelAppointmentHandler,
    CheckAvailabilityHandler,
    BusinessHoursConfig,
    { provide: BOOKING_QUERY_REPOSITORY, useClass: PrismaBookingQueryRepository },
  ],
})
export class BookingModule {}
