import { ApplicationError } from '@scheduler/shared-kernel'

/**
 * Domain errors for the booking module.
 *
 * `ApplicationError` supplies neither `code` nor `statusCode` (unlike
 * `InfrastructureError`, which hardcodes 500), so every subclass below declares
 * both. `GlobalExceptionFilter` reads exactly those two fields plus `message`
 * and `details` — that is the whole path from a thrown domain error to an HTTP
 * response body.
 *
 * ⚠️ None of these carries `transient: true`. That marker is what makes
 * `CommandBus`'s retry wrapper retry a failure, and a slot conflict must NOT be
 * retried — see docs/adr/0003-availability-and-selection-policy.md §2.4.
 */

/**
 * Why a requested window could not be booked.
 *
 * The first two come from the application-level availability check; the last
 * two come from the database exclusion constraints (ADR-0002) firing *after*
 * that check passed — i.e. a concurrent request committed in between. Keeping
 * them distinct is what lets a caller tell "the shop is fully booked" apart
 * from "you lost a race, try again immediately".
 */
/**
 * Mirrors `OutsideBusinessHoursReason` in
 * `modules/booking/domain/services/business-hours.ts`.
 *
 * Deliberately duplicated rather than imported: `eslint.config.mjs` forbids
 * `common/**` from importing `@/modules/**` (and the domain from importing
 * `@/common/**`), because `common/` must stay a leaf that any module can depend
 * on. Both are plain string-literal unions, so values assign across the boundary
 * without a cast — TypeScript's structural typing is what makes the duplication
 * safe rather than merely tolerated. If a third reason is ever added, add it in
 * both places; the compiler will flag the call site if you don't.
 */
type OutsideBusinessHoursReason = 'closed_day' | 'outside_hours'

export type SlotConflictReason =
  | 'no_service_bay_at_dealership'
  | 'no_qualified_technician_at_dealership'
  | 'no_free_service_bay'
  | 'no_free_qualified_technician'
  | 'service_bay_taken_concurrently'
  | 'technician_taken_concurrently'

/**
 * One message per reason.
 *
 * A single shared message ("neither is available") was actively misleading: for
 * `no_free_qualified_technician` a bay *was* free, and for the two `*_concurrently`
 * reasons the right advice is "retry now" — the opposite of "the shop is full".
 * `message` is the field most clients surface to a human, so collapsing four
 * situations into one sentence threw away the distinction `reason` exists to make.
 */
const SLOT_CONFLICT_MESSAGES: Record<SlotConflictReason, string> = {
  no_service_bay_at_dealership: 'This dealership has no service bays configured',
  no_qualified_technician_at_dealership:
    'No technician at this dealership is qualified for this service type',
  no_free_service_bay: 'Every service bay at this dealership is booked for the requested window',
  no_free_qualified_technician:
    'Every qualified technician at this dealership is booked for the requested window',
  service_bay_taken_concurrently:
    'The service bay was taken by another booking moments ago — please try again',
  technician_taken_concurrently:
    'The technician was taken by another booking moments ago — please try again',
}

export class AppointmentSlotConflictError extends ApplicationError {
  readonly code = 'APPOINTMENT_SLOT_CONFLICT'
  readonly statusCode = 409
  /** Also mirrored into `details.reason` for the HTTP response body — kept as
   * a typed field too so callers (metrics, tests) don't have to narrow `details`. */
  readonly reason: SlotConflictReason

  constructor(reason: SlotConflictReason) {
    super(SLOT_CONFLICT_MESSAGES[reason], { reason })
    this.reason = reason
  }
}

/**
 * The three foreign keys a booking request supplies that are not validated by
 * Zod (it can only check the shape of a UUID, not that a row exists).
 *
 * Each is a plain `404`: a well-formed id for something that does not exist is
 * the same class of mistake as a wrong path. Before these existed, a typo'd
 * customer or vehicle id reached Prisma's nested `connect`, threw an
 * untranslated `P2025`/`P2003`, and surfaced as a `500` — a client mistake
 * reported as a server fault, and counted against the service's error rate.
 */
export class CustomerNotFoundError extends ApplicationError {
  readonly code = 'CUSTOMER_NOT_FOUND'
  readonly statusCode = 404

  constructor(customerId: string) {
    super('Customer not found', { customerId })
  }
}

export class VehicleNotFoundError extends ApplicationError {
  readonly code = 'VEHICLE_NOT_FOUND'
  readonly statusCode = 404

  constructor(vehicleId: string) {
    super('Vehicle not found', { vehicleId })
  }
}

export class DealershipNotFoundError extends ApplicationError {
  readonly code = 'DEALERSHIP_NOT_FOUND'
  readonly statusCode = 404

  constructor(dealershipId: string) {
    super('Dealership not found', { dealershipId })
  }
}

/**
 * Both ids exist, but the vehicle belongs to a different customer.
 *
 * 422, not 404: nothing is missing — the request is semantically wrong. The
 * database has a foreign key for each id separately and nothing relating them,
 * so this invariant (which the ERD asserts) has to be enforced here.
 */
export class VehicleNotOwnedByCustomerError extends ApplicationError {
  readonly code = 'VEHICLE_NOT_OWNED_BY_CUSTOMER'
  readonly statusCode = 422

  constructor(vehicleId: string, customerId: string) {
    super('The vehicle does not belong to this customer', { vehicleId, customerId })
  }
}

export class AppointmentNotFoundError extends ApplicationError {
  readonly code = 'APPOINTMENT_NOT_FOUND'
  readonly statusCode = 404

  constructor(appointmentId: string) {
    super('Appointment not found', { appointmentId })
  }
}

/**
 * Raised only for a `COMPLETED` appointment. Cancelling an already-`CANCELLED`
 * one is a no-op returning 200, not an error — cancel is the operation most
 * likely to be retried over a flaky connection, so retrying it must be safe.
 * See docs/01_business_requirements.md § Assumptions.
 */
export class AppointmentNotCancellableError extends ApplicationError {
  readonly code = 'APPOINTMENT_NOT_CANCELLABLE'
  readonly statusCode = 409

  constructor(appointmentId: string, status: string) {
    super(`An appointment with status ${status} cannot be cancelled`, { appointmentId, status })
  }
}

export class ServiceTypeNotFoundError extends ApplicationError {
  readonly code = 'SERVICE_TYPE_NOT_FOUND'
  readonly statusCode = 404

  constructor(serviceTypeId: string) {
    super('Service type not found', { serviceTypeId })
  }
}

/**
 * The request is well-formed (Zod already accepted it) but the resulting
 * window falls outside the dealership's opening times — either the whole day is
 * closed, or the window doesn't fit between `BUSINESS_HOURS_START`/`END`
 * (ADR-0003 §2.3). Zod cannot express this: it depends on
 * `ServiceType.durationMinutes` and on configuration, not just the request body.
 * 422, not 400: the syntax is valid, the business rule is not satisfied.
 *
 * `details.reason` separates the two because the client should react
 * differently — `closed_day` means "pick another date", `outside_hours` means
 * "pick another time on this date".
 */
export class AppointmentOutsideBusinessHoursError extends ApplicationError {
  readonly code = 'APPOINTMENT_OUTSIDE_BUSINESS_HOURS'
  readonly statusCode = 422
  readonly reason: OutsideBusinessHoursReason

  constructor(reason: OutsideBusinessHoursReason, startAt: Date, endAt: Date) {
    super(
      reason === 'closed_day'
        ? 'The dealership is closed on the requested date'
        : 'The requested window falls outside business hours',
      { reason, startAt: startAt.toISOString(), endAt: endAt.toISOString() },
    )
    this.reason = reason
  }
}
