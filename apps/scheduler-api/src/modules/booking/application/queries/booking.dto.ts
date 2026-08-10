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
