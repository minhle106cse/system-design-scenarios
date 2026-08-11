import { Injectable } from '@nestjs/common'
import type { ITransactionalCommandHandler } from '@scheduler/shared-kernel'
import { CommandHandler } from '@/infrastructure/cqrs/decorators/command-handler.decorator'
import {
  AppointmentNotCancellableError,
  AppointmentNotFoundError,
} from '@/common/errors/booking.error'
import type { SchedulerApiRepos } from '@/infrastructure/cqrs/scheduler-api-repos'
import { UnreachableError } from '@scheduler/shared-kernel'
import type { AppointmentSummaryDto } from '../appointment-summary.dto'
import { CancelAppointmentCommand } from './cancel-appointment.command'

/**
 * Implements UC-3. Idempotent on an already-`CANCELLED` appointment (returns
 * `200` with the unchanged record, no write) and refuses a `COMPLETED` one
 * with `409` — see `docs/01_business_requirements.md § Assumptions` and
 * `Appointment.cancel()`'s `CancelOutcome` for where this transition table
 * actually lives.
 */
@Injectable()
@CommandHandler(CancelAppointmentCommand)
export class CancelAppointmentHandler implements ITransactionalCommandHandler<
  CancelAppointmentCommand,
  AppointmentSummaryDto,
  SchedulerApiRepos
> {
  readonly kind = 'transactional' as const

  async execute(
    command: CancelAppointmentCommand,
    repos: SchedulerApiRepos,
  ): Promise<AppointmentSummaryDto> {
    const appointment = await repos.appointments.findById(command.appointmentId)
    if (!appointment) throw new AppointmentNotFoundError(command.appointmentId)

    switch (appointment.cancel()) {
      case 'cancelled':
        // Only a real transition writes — retrying an already-cancelled cancel
        // must be a true no-op, not a redundant UPDATE.
        await repos.appointments.update(appointment)
        break
      case 'already_cancelled':
        break
      case 'not_cancellable':
        throw new AppointmentNotCancellableError(appointment.id, appointment.status)
      default:
        // Exhaustiveness guard: a fourth CancelOutcome added later must fail
        // loudly here, not fall through silently.
        throw new UnreachableError('Unhandled CancelOutcome')
    }

    const [serviceBay, technician] = await Promise.all([
      repos.serviceBays.findById(appointment.serviceBayId),
      repos.technicians.findById(appointment.technicianId),
    ])
    // Both ids came off a persisted, previously-valid Appointment row — their
    // referents cannot have been hard-deleted (this schema has no cascading
    // hard delete, only soft delete via `deletedAt`). A miss here means
    // `SOFT_DELETE_MODELS` filtered a bay/technician that a live appointment
    // still points to, which is a data-integrity bug, not a 404 to hand the
    // caller — hence UnreachableError rather than AppointmentNotFoundError.
    if (!serviceBay || !technician) {
      throw new UnreachableError(
        `Appointment ${appointment.id} references a missing service bay or technician`,
      )
    }

    return {
      id: appointment.id,
      status: appointment.status,
      startAt: appointment.startAt.toISOString(),
      endAt: appointment.endAt.toISOString(),
      serviceBay: { id: serviceBay.id, label: serviceBay.label },
      technician: { id: technician.id, name: technician.name },
    }
  }
}
