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
}
