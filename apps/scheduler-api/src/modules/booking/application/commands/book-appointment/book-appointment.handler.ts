import { Injectable } from '@nestjs/common'
import { UnreachableError, type ITransactionalCommandHandler } from '@scheduler/shared-kernel'
import { CommandHandler } from '@/infrastructure/cqrs/decorators/command-handler.decorator'
import {
  AppointmentOutsideBusinessHoursError,
  AppointmentSlotConflictError,
  CustomerNotFoundError,
  DealershipNotFoundError,
  ServiceTypeNotFoundError,
  VehicleNotFoundError,
  VehicleNotOwnedByCustomerError,
  type SlotConflictReason,
} from '@/common/errors/booking.error'
import type { SchedulerApiRepos } from '@/infrastructure/cqrs/scheduler-api-repos'
import { recordBookingAttempt } from '@/infrastructure/observability/booking.metrics'
import { Appointment } from '../../../domain/entities/appointment.entity'
import { checkBusinessHours } from '../../../domain/services/business-hours'
import {
  selectFirstFree,
  type SelectableResource,
} from '../../../domain/services/resource-selection'
import { BusinessHoursConfig } from '../../business-hours.config'
import type { AppointmentSummaryDto } from '../appointment-summary.dto'
import { BookAppointmentCommand } from './book-appointment.command'

interface BaySelectable extends SelectableResource {
  readonly label: string
}
interface TechnicianSelectable extends SelectableResource {
  readonly name: string
}

/**
 * Implements UC-1 (`docs/02_use_cases.md`) and requirement 2's availability
 * check (`docs/01_business_requirements.md`).
 *
 * The whole check-then-write sequence — validate references, read candidates,
 * read the busy set, select, insert — runs inside ONE transaction via
 * `SchedulerApiRepos`, which is what lets `save()` translate a losing race into
 * a domain error rather than a raw Postgres exception (ADR-0002, ADR-0003 §2.5).
 * All reads go through `repos.*`, never a query-repository — a command that
 * reads to decide must read the source of truth (`directives/cqrs_pattern.md`).
 *
 * A resulting `AppointmentSlotConflictError` is deliberately NOT retried by
 * `CommandBus` (it carries no `transient: true`): a taken slot stays taken, so
 * the caller needs the 409 to pick another window, not a delayed duplicate of
 * the same failure (ADR-0003 §2.4).
 */
@Injectable()
@CommandHandler(BookAppointmentCommand)
export class BookAppointmentHandler implements ITransactionalCommandHandler<
  BookAppointmentCommand,
  AppointmentSummaryDto,
  SchedulerApiRepos
> {
  readonly kind = 'transactional' as const

  constructor(private readonly businessHours: BusinessHoursConfig) {}

  async execute(
    command: BookAppointmentCommand,
    repos: SchedulerApiRepos,
  ): Promise<AppointmentSummaryDto> {
    // All four reference reads in one round trip. Every one of these ids is a
    // foreign key on `Appointment`; without an explicit lookup, a well-formed
    // but non-existent id reached Prisma's nested `connect` and surfaced as an
    // untranslated 500. Reading through the transaction's (soft-delete-aware)
    // client also means a soft-deleted row is a clean 404 rather than a silent
    // successful `connect` — the extension only filters find*/count, not create.
    const [customer, vehicle, dealership, serviceType] = await Promise.all([
      repos.customers.findById(command.customerId),
      repos.vehicles.findById(command.vehicleId),
      repos.dealerships.findById(command.dealershipId),
      repos.serviceTypes.findById(command.serviceTypeId),
    ])

    if (!customer) throw new CustomerNotFoundError(command.customerId)
    if (!vehicle) throw new VehicleNotFoundError(command.vehicleId)
    if (!dealership) throw new DealershipNotFoundError(command.dealershipId)
    if (!serviceType) throw new ServiceTypeNotFoundError(command.serviceTypeId)

    // The ERD asserts Customer owns Vehicle, but the database has only the two
    // foreign keys independently — nothing relates them. Enforced here or not
    // at all.
    if (vehicle.customerId !== command.customerId) {
      throw new VehicleNotOwnedByCustomerError(command.vehicleId, command.customerId)
    }

    // Defence in depth behind the CHECK constraint added in
    // `20260810150000_service_type_duration_positive`. A zero duration yields an
    // empty tstzrange, which overlaps nothing — both exclusion constraints would
    // silently stop applying. The database now refuses to store such a row; if
    // one somehow appears, fail loudly rather than book against it.
    if (serviceType.durationMinutes <= 0) {
      throw new UnreachableError(
        `ServiceType ${serviceType.id} has a non-positive durationMinutes (${serviceType.durationMinutes})`,
      )
    }

    const window = {
      startAt: command.startAt,
      endAt: new Date(command.startAt.getTime() + serviceType.durationMinutes * 60_000),
    }

    const outsideHours = checkBusinessHours(window, this.businessHours.get())
    if (outsideHours) {
      throw new AppointmentOutsideBusinessHoursError(outsideHours, window.startAt, window.endAt)
    }

    const [candidateBays, candidateTechnicians, busy] = await Promise.all([
      repos.serviceBays.findByDealership(command.dealershipId),
      repos.technicians.findQualifiedByDealership(command.dealershipId, command.serviceTypeId),
      repos.appointments.findBusyResourceIds(command.dealershipId, window),
    ])

    // "No bay exists here" and "every bay is busy" are different problems with
    // different fixes (call the dealership vs. pick another time), so they get
    // different reasons rather than being collapsed into one.
    if (candidateBays.length === 0) this.reject('no_service_bay_at_dealership')
    if (candidateTechnicians.length === 0) this.reject('no_qualified_technician_at_dealership')

    const bayCandidates: BaySelectable[] = candidateBays.map((bay) => ({
      id: bay.id,
      sortKey: bay.label,
      label: bay.label,
    }))
    const selectedBay = selectFirstFree(bayCandidates, busy.serviceBayIds)
    if (!selectedBay) {
      this.reject('no_free_service_bay')
    }

    const technicianCandidates: TechnicianSelectable[] = candidateTechnicians.map((technician) => ({
      id: technician.id,
      sortKey: technician.name,
      name: technician.name,
    }))
    const selectedTechnician = selectFirstFree(technicianCandidates, busy.technicianIds)
    if (!selectedTechnician) {
      this.reject('no_free_qualified_technician')
    }

    const appointment = Appointment.createScheduled({
      customerId: command.customerId,
      vehicleId: command.vehicleId,
      dealershipId: command.dealershipId,
      serviceTypeId: command.serviceTypeId,
      serviceBayId: selectedBay.id,
      technicianId: selectedTechnician.id,
      startAt: command.startAt,
      durationMinutes: serviceType.durationMinutes,
    })

    try {
      await repos.appointments.save(appointment)
    } catch (error) {
      if (error instanceof AppointmentSlotConflictError) {
        recordBookingAttempt(error.reason)
      }
      throw error
    }

    return {
      id: appointment.id,
      status: appointment.status,
      startAt: appointment.startAt.toISOString(),
      endAt: appointment.endAt.toISOString(),
      serviceBay: { id: selectedBay.id, label: selectedBay.label },
      technician: { id: selectedTechnician.id, name: selectedTechnician.name },
    }
  }

  /**
   * Counts the success only once the transaction has actually committed.
   *
   * Previously `recordBookingAttempt('booked')` fired inside `execute`, i.e.
   * inside the transaction — a COMMIT failure (including a `P2034` that
   * `CommandBus` then retries) counted a booking that never existed, and the
   * retry counted it again. `afterCommit` exists in
   * `ITransactionalCommandHandler` for exactly this: it runs only after a real
   * commit and is never retried. The refusal paths below stay inline because
   * they always throw, so nothing was ever committed to over-report.
   */
  afterCommit(): void {
    recordBookingAttempt('booked')
  }

  /** Records the refusal reason and throws — a small helper so the "no candidate" branches read as one line each. */
  private reject(reason: SlotConflictReason): never {
    recordBookingAttempt(reason)
    throw new AppointmentSlotConflictError(reason)
  }
}
