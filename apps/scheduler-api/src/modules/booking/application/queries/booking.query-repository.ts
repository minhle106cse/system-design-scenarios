import type { AppointmentStatus } from '../../domain/entities/appointment.entity'
import type { TimeWindow } from '../../domain/services/business-hours'

/**
 * Query-side reader, on the plain (non-transactional) client — backs
 * `GET /availability`, which has no transaction and must not open one
 * (`directives/cqrs_pattern.md` §2). Distinct from the domain-layer write
 * repositories used inside the booking transaction: those answer "is this ONE
 * window free" for a command that is about to write; this answers "which
 * windows across a WHOLE DAY are free" for a read that creates nothing, in as
 * few round trips as possible.
 */

export interface ServiceTypeSummary {
  readonly id: string
  readonly durationMinutes: number
}

/**
 * Only the id — existence is the whole question. `GET /availability` needs no
 * other dealership field, and reading one would suggest it did.
 */
export interface DealershipSummary {
  readonly id: string
}

/**
 * One appointment with its bay and technician already joined, because
 * `GET /appointments/:id` returns their display fields rather than bare ids —
 * see `AppointmentDto` in `booking.dto.ts`.
 */
export interface AppointmentDetail {
  readonly id: string
  readonly status: AppointmentStatus
  readonly startAt: Date
  readonly endAt: Date
  readonly serviceBay: { readonly id: string; readonly label: string }
  readonly technician: { readonly id: string; readonly name: string }
}

export interface BayCandidate {
  readonly id: string
}

export interface TechnicianCandidate {
  readonly id: string
}

export interface OverlappingAppointment {
  readonly serviceBayId: string
  readonly technicianId: string
  readonly startAt: Date
  readonly endAt: Date
}

/** DI token — `IBookingQueryRepository` is an interface and erases at runtime. */
export const BOOKING_QUERY_REPOSITORY = Symbol('BOOKING_QUERY_REPOSITORY')

export interface IBookingQueryRepository {
  /** `null` when absent or soft-deleted. */
  findServiceType(serviceTypeId: string): Promise<ServiceTypeSummary | null>

  /**
   * `null` when absent or soft-deleted.
   *
   * Worth its own round trip even though nothing downstream reads the result:
   * without it, an unknown `dealershipId` produced zero bays, which produced
   * zero available slots, which is exactly what a fully-booked day looks like —
   * while `POST /appointments` answered `404` for the same id. The read path
   * has to agree with the write path about which requests are answerable at all.
   */
  findDealership(dealershipId: string): Promise<DealershipSummary | null>

  findDealershipBays(dealershipId: string): Promise<BayCandidate[]>

  findQualifiedTechnicians(
    dealershipId: string,
    serviceTypeId: string,
  ): Promise<TechnicianCandidate[]>

  /**
   * Every `SCHEDULED` appointment overlapping `window` at the dealership — one
   * query for the whole business day, not one per candidate slot. The handler
   * re-filters this single result set per slot in memory.
   */
  findOverlappingAppointments(
    dealershipId: string,
    window: TimeWindow,
  ): Promise<OverlappingAppointment[]>

  /**
   * `null` when absent or soft-deleted. A `CANCELLED` appointment IS returned —
   * cancelling changes the status, it does not remove the record
   * (`docs/01_business_requirements.md § Assumptions`), and a client that just
   * cancelled needs to be able to read back what it cancelled.
   */
  findAppointmentById(appointmentId: string): Promise<AppointmentDetail | null>
}
