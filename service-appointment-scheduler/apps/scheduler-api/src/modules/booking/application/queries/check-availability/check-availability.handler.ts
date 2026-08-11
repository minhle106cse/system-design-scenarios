import { Inject, Injectable } from '@nestjs/common'
import type { IQueryHandler } from '@scheduler/shared-kernel'
import { QueryHandler } from '@/infrastructure/cqrs/decorators/query-handler.decorator'
import { DealershipNotFoundError, ServiceTypeNotFoundError } from '@/common/errors/booking.error'
import { startAvailabilityTimer } from '@/infrastructure/observability/booking.metrics'
import {
  businessDayBounds,
  enumerateCandidateWindows,
  filterFutureWindows,
} from '../../../domain/services/business-hours'
import { countFree } from '../../../domain/services/resource-selection'
import { BusinessHoursConfig } from '../../business-hours.config'
import type { AvailabilityDto } from '../booking.dto'
import { BOOKING_QUERY_REPOSITORY, type IBookingQueryRepository } from '../booking.query-repository'
import { CheckAvailabilityQuery } from './check-availability.query'

/**
 * Implements UC-2. No transaction — reads through `IBookingQueryRepository` on
 * the plain client (`directives/cqrs_pattern.md` §2), and takes no lock: a
 * slot reported free here can still lose the race to `POST /appointments`
 * (ADR-0003 §2.6). One query per input (service type, bays, qualified
 * technicians, the day's overlapping appointments), then every candidate
 * window is evaluated against that one result set in memory.
 */
@Injectable()
@QueryHandler(CheckAvailabilityQuery)
export class CheckAvailabilityHandler implements IQueryHandler<
  CheckAvailabilityQuery,
  AvailabilityDto
> {
  constructor(
    @Inject(BOOKING_QUERY_REPOSITORY) private readonly repo: IBookingQueryRepository,
    private readonly businessHours: BusinessHoursConfig,
  ) {}

  async execute(query: CheckAvailabilityQuery): Promise<AvailabilityDto> {
    const stopTimer = startAvailabilityTimer()
    try {
      return await this.compute(query)
    } finally {
      stopTimer()
    }
  }

  private async compute(query: CheckAvailabilityQuery): Promise<AvailabilityDto> {
    // Both references are resolved before any work, and in the same order
    // `BookAppointmentHandler` resolves them, so a request that is wrong about
    // both gets the same error from the read path and the write path.
    //
    // The dealership read exists purely to reject: without it an unknown id
    // yielded zero bays -> zero available slots -> `200 []`, which is
    // indistinguishable from a fully booked day, while POST answered 404 for
    // the same id.
    const [dealership, serviceType] = await Promise.all([
      this.repo.findDealership(query.dealershipId),
      this.repo.findServiceType(query.serviceTypeId),
    ])
    if (!dealership) throw new DealershipNotFoundError(query.dealershipId)
    if (!serviceType) throw new ServiceTypeNotFoundError(query.serviceTypeId)

    const hours = this.businessHours.get()
    // `enumerateCandidateWindows` returns nothing for a closed day (weekend,
    // configured holiday). Past slots are dropped separately: a request for
    // today must not advertise this morning, and a request for a past date must
    // return nothing at all — POST would reject every one of them anyway, so
    // offering them is a promise the write path won't keep.
    const windows = filterFutureWindows(
      enumerateCandidateWindows(query.date, hours, serviceType.durationMinutes),
      new Date(),
    )
    if (windows.length === 0) {
      return {
        date: query.date,
        serviceTypeId: query.serviceTypeId,
        durationMinutes: serviceType.durationMinutes,
        availableSlots: [],
      }
    }

    const dayBounds = businessDayBounds(query.date, hours)
    const [bays, technicians, appointments] = await Promise.all([
      this.repo.findDealershipBays(query.dealershipId),
      this.repo.findQualifiedTechnicians(query.dealershipId, query.serviceTypeId),
      this.repo.findOverlappingAppointments(query.dealershipId, dayBounds),
    ])

    const availableSlots = windows
      .map((window) => {
        // Re-filter the one fetched day's appointments per slot, in memory —
        // the alternative (one query per slot) would be N queries for one
        // request. Same half-open predicate as the database reads
        // (ADR-0003 §2.1).
        const overlapping = appointments.filter(
          (appointment) => appointment.startAt < window.endAt && appointment.endAt > window.startAt,
        )
        const busyBayIds = new Set(overlapping.map((appointment) => appointment.serviceBayId))
        const busyTechnicianIds = new Set(
          overlapping.map((appointment) => appointment.technicianId),
        )

        return {
          startAt: window.startAt.toISOString(),
          endAt: window.endAt.toISOString(),
          availableBays: countFree(bays, busyBayIds),
          availableTechnicians: countFree(technicians, busyTechnicianIds),
        }
      })
      // Counts, not ids (ADR-0003 §2.6) — but a slot with zero of either is not
      // "available" at all, so it is dropped rather than reported as a 0.
      .filter((slot) => slot.availableBays > 0 && slot.availableTechnicians > 0)

    return {
      date: query.date,
      serviceTypeId: query.serviceTypeId,
      durationMinutes: serviceType.durationMinutes,
      availableSlots,
    }
  }
}
