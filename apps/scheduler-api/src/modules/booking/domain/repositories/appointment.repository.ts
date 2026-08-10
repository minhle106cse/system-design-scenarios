import type { Appointment } from '../entities/appointment.entity'
import type { TimeWindow } from '../services/business-hours'

/**
 * Write-side repository for `Appointment`. Constructed only by
 * `SchedulerApiRepoFactory` from an open transaction client, so its methods
 * carry no `tx` argument (`directives/cqrs_pattern.md` §1).
 */

/** Resource ids already committed to overlapping `SCHEDULED` appointments. */
export interface BusyResourceIds {
  readonly serviceBayIds: ReadonlySet<string>
  readonly technicianIds: ReadonlySet<string>
}

export interface IAppointmentRepository {
  /**
   * The application-level half of requirement 2's availability check.
   *
   * Uses the half-open overlap predicate `startAt < windowEnd AND endAt >
   * windowStart`, which is arithmetically identical to the
   * `tstzrange(start_at, end_at, '[)') &&` in ADR-0002's exclusion constraints.
   * The two must agree on boundaries or the API and the database disagree about
   * what "10:00–11:00 then 11:00–12:00" means — see ADR-0003 §2.1.
   *
   * Called from inside the booking transaction, so it sees this transaction's
   * own uncommitted writes: a command that reads in order to decide must read
   * the source of truth (`directives/cqrs_pattern.md`).
   */
  findBusyResourceIds(dealershipId: string, window: TimeWindow): Promise<BusyResourceIds>

  /** `null` when absent or soft-deleted. */
  findById(appointmentId: string): Promise<Appointment | null>

  /**
   * INSERT.
   *
   * Throws `AppointmentSlotConflictError` when one of ADR-0002's exclusion
   * constraints rejects the row — i.e. a concurrent transaction committed the
   * same bay or technician for an overlapping window after this one's
   * availability check passed. Translating the Postgres error here rather than
   * in the handler is what keeps Prisma out of the application layer
   * (ADR-0003 §2.5).
   */
  save(appointment: Appointment): Promise<void>

  /** UPDATE of a mutable field — currently only the `status` transition. */
  update(appointment: Appointment): Promise<void>
}
