/** Existence + ownership lookup for the vehicle being serviced. See `customer.repository.ts`. */

export interface VehicleRef {
  readonly id: string
  /**
   * The owning customer. Carried so the handler can enforce the invariant the
   * ERD asserts but no constraint enforces: an appointment's vehicle must
   * belong to that appointment's customer. The database has both foreign keys
   * individually, and nothing relating them — a booking for someone else's car
   * was accepted.
   */
  readonly customerId: string
}

export interface IVehicleRepository {
  /** `null` when absent or soft-deleted. */
  findById(vehicleId: string): Promise<VehicleRef | null>
}
