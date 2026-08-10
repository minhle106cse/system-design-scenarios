/** Read access to technicians from inside the booking transaction. Reference data — see `service-bay.repository.ts`. */

export interface TechnicianRef {
  readonly id: string
  /** Ordering key for deterministic selection — ADR-0003 §2.2. */
  readonly name: string
}

export interface ITechnicianRepository {
  /**
   * Technicians at the dealership **qualified** for this service type.
   *
   * "Qualified" is the existence of a `TechnicianServiceType` row, not a
   * skill-level field (`docs/01_business_requirements.md` § Assumptions). The
   * filter belongs in the query rather than in the caller: a technician who is
   * free but unqualified must never reach the selection step, because
   * requirement 2 asks for "a qualified Technician", not any technician.
   */
  findQualifiedByDealership(dealershipId: string, serviceTypeId: string): Promise<TechnicianRef[]>

  /** `null` when absent or soft-deleted. Used to render a booked/cancelled appointment's `technician` field. */
  findById(technicianId: string): Promise<TechnicianRef | null>
}
