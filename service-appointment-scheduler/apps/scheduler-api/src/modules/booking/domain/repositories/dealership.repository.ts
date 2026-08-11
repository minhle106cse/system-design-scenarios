/**
 * Existence check for the dealership being booked at. See `customer.repository.ts`.
 *
 * Distinct from the other two in why it matters: an unknown `dealershipId`
 * never reached a foreign key at all, because the bay/technician queries simply
 * returned empty lists — so the caller got `409 APPOINTMENT_SLOT_CONFLICT` with
 * `reason: no_free_service_bay`, which the API contract defines as "every bay
 * at the dealership is busy". A typo'd id was reported as capacity exhaustion
 * and counted into the booking-conflict metric alongside genuine contention.
 */

export interface DealershipRef {
  readonly id: string
}

export interface IDealershipRepository {
  /** `null` when absent or soft-deleted. */
  findById(dealershipId: string): Promise<DealershipRef | null>
}
