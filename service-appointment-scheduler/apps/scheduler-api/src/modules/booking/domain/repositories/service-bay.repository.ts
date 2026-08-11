/**
 * Read access to service bays from inside the booking transaction.
 *
 * `ServiceBay` is reference data here: this service never creates, updates or
 * deletes one, so there is no invariant for an entity to protect and no state
 * transition for a factory to guard. Modelling it as a full entity with a
 * mapper would be ceremony around a two-field row. It enters the domain as the
 * lightweight reference type below instead — the same reasoning applies to
 * `technician.repository.ts` and `service-type.repository.ts`.
 */

export interface ServiceBayRef {
  readonly id: string
  /** Ordering key for deterministic selection — ADR-0003 §2.2. */
  readonly label: string
}

export interface IServiceBayRepository {
  /** Every non-deleted bay at the dealership. Soft-delete filtering is automatic. */
  findByDealership(dealershipId: string): Promise<ServiceBayRef[]>

  /** `null` when absent or soft-deleted. Used to render a booked/cancelled appointment's `serviceBay` field. */
  findById(serviceBayId: string): Promise<ServiceBayRef | null>
}
