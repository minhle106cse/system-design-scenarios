import { v7 as uuidv7 } from 'uuid'

/**
 * The appointment lifecycle, declared in the domain rather than imported from
 * `@/generated`. The domain layer is lint-forbidden from importing Prisma
 * (`eslint.config.mjs`), and the values are string literals identical to the
 * Prisma enum's — so the mapper can assign `row.status` straight across without
 * a cast or a validator (`directives/domain_modeling.md` §2, trust on read).
 */
export const AppointmentStatus = {
  SCHEDULED: 'SCHEDULED',
  CANCELLED: 'CANCELLED',
  COMPLETED: 'COMPLETED',
} as const

export type AppointmentStatus = (typeof AppointmentStatus)[keyof typeof AppointmentStatus]

/**
 * What `cancel()` did, so the caller can map it to an HTTP response without
 * re-deriving the transition table.
 *
 * `directives/domain_modeling.md` §0 requires behaviour methods to mutate in
 * place rather than return a new entity — that ban is on the immutable-copy
 * style, not on returning a value. Returning the outcome keeps the legal
 * transitions in the domain (where another caller cannot bypass them) while
 * leaving the 200-vs-409 decision in the application layer (where HTTP belongs).
 */
export type CancelOutcome = 'cancelled' | 'already_cancelled' | 'not_cancellable'

interface RehydrateProps {
  readonly id: string
  readonly customerId: string
  readonly vehicleId: string
  readonly dealershipId: string
  readonly serviceTypeId: string
  readonly serviceBayId: string
  readonly technicianId: string
  readonly startAt: Date
  readonly endAt: Date
  readonly status: AppointmentStatus
  readonly createdAt: Date
}

interface CreateScheduledProps {
  readonly customerId: string
  readonly vehicleId: string
  readonly dealershipId: string
  readonly serviceTypeId: string
  readonly serviceBayId: string
  readonly technicianId: string
  readonly startAt: Date
  /** From `ServiceType.durationMinutes` — `endAt` is derived, never supplied. */
  readonly durationMinutes: number
}

export class Appointment {
  private _id: string
  private _customerId: string
  private _vehicleId: string
  private _dealershipId: string
  private _serviceTypeId: string
  private _serviceBayId: string
  private _technicianId: string
  private _startAt: Date
  private _endAt: Date
  private _status: AppointmentStatus
  private _createdAt: Date

  private constructor(props: RehydrateProps) {
    this._id = props.id
    this._customerId = props.customerId
    this._vehicleId = props.vehicleId
    this._dealershipId = props.dealershipId
    this._serviceTypeId = props.serviceTypeId
    this._serviceBayId = props.serviceBayId
    this._technicianId = props.technicianId
    this._startAt = new Date(props.startAt.getTime())
    this._endAt = new Date(props.endAt.getTime())
    this._status = props.status
    this._createdAt = new Date(props.createdAt.getTime())
  }

  /**
   * The only door into a new appointment, and it always produces a `SCHEDULED`
   * one — status is not a parameter (`directives/domain_modeling.md` §1). There
   * is no second creation variant, but the plain name `create` is avoided here
   * because the baked-in status is the point of the factory.
   *
   * `endAt` is computed from the service type's duration rather than accepted,
   * so an appointment whose window contradicts its service type is not
   * representable. This matters more than it looks: `endAt` is one of the two
   * columns the exclusion constraints in ADR-0002 range over.
   *
   * The id is generated here, never accepted from the caller — UUIDv7 for
   * time-ordered B-tree locality, matching `database_standard.md`'s
   * `@default(uuid(7))`. Prisma's own default never fires, because the mapper
   * always supplies this value on INSERT.
   */
  static createScheduled(props: CreateScheduledProps): Appointment {
    const startAt = new Date(props.startAt.getTime())

    return new Appointment({
      id: uuidv7(),
      customerId: props.customerId,
      vehicleId: props.vehicleId,
      dealershipId: props.dealershipId,
      serviceTypeId: props.serviceTypeId,
      serviceBayId: props.serviceBayId,
      technicianId: props.technicianId,
      startAt,
      endAt: new Date(startAt.getTime() + props.durationMinutes * 60_000),
      status: AppointmentStatus.SCHEDULED,
      createdAt: new Date(),
    })
  }

  /**
   * Reconstructs a persisted appointment. Called only by
   * `AppointmentMapper.toDomain` — it trusts the row, because the write side
   * plus the database constraints already guarantee validity
   * (`directives/domain_modeling.md` §2).
   */
  static rehydrate(props: RehydrateProps): Appointment {
    return new Appointment(props)
  }

  /**
   * SCHEDULED → CANCELLED. Freeing the bay and the technician is a side effect
   * of this transition alone: ADR-0002's exclusion constraints are scoped to
   * `status = 'SCHEDULED'`, so the row stops participating the moment this
   * commits — no delete, no separate release step.
   */
  cancel(): CancelOutcome {
    if (this._status === AppointmentStatus.CANCELLED) return 'already_cancelled'
    if (this._status !== AppointmentStatus.SCHEDULED) return 'not_cancellable'

    this._status = AppointmentStatus.CANCELLED
    return 'cancelled'
  }

  get id(): string {
    return this._id
  }

  get customerId(): string {
    return this._customerId
  }

  get vehicleId(): string {
    return this._vehicleId
  }

  get dealershipId(): string {
    return this._dealershipId
  }

  get serviceTypeId(): string {
    return this._serviceTypeId
  }

  get serviceBayId(): string {
    return this._serviceBayId
  }

  get technicianId(): string {
    return this._technicianId
  }

  // Dates are cloned out as well as in — handing back `this._startAt` would let
  // a caller move a booked window by mutating the object it was given.
  get startAt(): Date {
    return new Date(this._startAt.getTime())
  }

  get endAt(): Date {
    return new Date(this._endAt.getTime())
  }

  get status(): AppointmentStatus {
    return this._status
  }

  get createdAt(): Date {
    return new Date(this._createdAt.getTime())
  }
}
