/**
 * Existence check for the customer a booking is made for. Reference data — see
 * `service-bay.repository.ts` for why these are lightweight refs rather than
 * entities.
 *
 * This exists because `Appointment.customerId` is a foreign key written by
 * `connect: { id }`, and Prisma's soft-delete extension only rewrites
 * `find*`/`count` — **not** `create`. Without an explicit read first, a
 * soft-deleted customer still connected successfully and the booking was
 * created against it silently; a non-existent one produced an untranslated
 * Prisma error and a `500`. Reading through the extended client here makes both
 * cases a clean `404`.
 */

export interface CustomerRef {
  readonly id: string
}

export interface ICustomerRepository {
  /** `null` when absent or soft-deleted. */
  findById(customerId: string): Promise<CustomerRef | null>
}
