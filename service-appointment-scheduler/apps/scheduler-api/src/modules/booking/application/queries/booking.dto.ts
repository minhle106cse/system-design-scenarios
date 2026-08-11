/**
 * Response DTOs for the booking module's query side. Flat, at the
 * `application/queries/` level, per `directives/cqrs_pattern.md`'s CANONICAL
 * placement rule — not nested inside `check-availability/`.
 */

export interface AvailabilitySlotDto {
  readonly startAt: string
  readonly endAt: string
  /**
   * Counts, not ids — deliberately. A slot is not a reservation
   * (ADR-0003 §2.6): the server selects at booking time (§2.2), so an id here
   * would read as "this one is yours" when it is not, and would leak internal
   * resource identity the client cannot act on anyway.
   */
  readonly availableBays: number
  readonly availableTechnicians: number
}

export interface AvailabilityDto {
  readonly date: string
  readonly serviceTypeId: string
  readonly durationMinutes: number
  readonly availableSlots: AvailabilitySlotDto[]
}

/**
 * The response body of `GET /appointments/:id` — re-exported here, at the
 * `application/queries/` level where this module's query response DTOs live,
 * rather than redeclared.
 *
 * It is deliberately the SAME type the two write endpoints return. A client
 * that books, then reads back what it booked, must receive one shape, and
 * `presentation/schemas/responses.schema.ts` publishes exactly one
 * `appointmentResponseSchema` for all three routes — a second, structurally
 * identical interface would let the read drift from the write while both
 * continued to typecheck against a spec that describes only one of them.
 */
export type { AppointmentSummaryDto as AppointmentDto } from '../commands/appointment-summary.dto'
