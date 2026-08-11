/** Read access to service types from inside the booking transaction. Reference data — see `service-bay.repository.ts`. */

export interface ServiceTypeRef {
  readonly id: string
  readonly name: string
  /**
   * The single input that turns a requested `startAt` into a window. Read from
   * the database rather than sent by the client, so a caller cannot shorten a
   * 90-minute job to 15 minutes to squeeze into a busy slot.
   */
  readonly durationMinutes: number
}

export interface IServiceTypeRepository {
  /** `null` when absent or soft-deleted. */
  findById(serviceTypeId: string): Promise<ServiceTypeRef | null>
}
