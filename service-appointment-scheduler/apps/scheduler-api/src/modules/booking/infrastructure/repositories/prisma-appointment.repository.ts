import { AppointmentSlotConflictError } from '@/common/errors/booking.error'
import { Appointment } from '../../domain/entities/appointment.entity'
import type {
  BusyResourceIds,
  IAppointmentRepository,
} from '../../domain/repositories/appointment.repository'
import type { TimeWindow } from '../../domain/services/business-hours'
import { AppointmentMapper } from '../mappers/appointment.mapper'
import { ExclusionViolationDetector } from './exclusion-violation'
import type { Prisma } from '@/generated'

/**
 * Write-side repository. Constructed only by `SchedulerApiRepoFactory` from an
 * open `Prisma.TransactionClient` — never a DI provider
 * (`directives/cqrs_pattern.md` §1).
 */
export class PrismaAppointmentRepository implements IAppointmentRepository {
  private readonly exclusionViolationDetector = new ExclusionViolationDetector()

  constructor(private readonly client: Prisma.TransactionClient) {}

  async findBusyResourceIds(dealershipId: string, window: TimeWindow): Promise<BusyResourceIds> {
    // Half-open overlap: startAt < windowEnd AND endAt > windowStart. Kept
    // arithmetically identical to ADR-0002's tstzrange(...,'[)') && predicate —
    // see docs/adr/0003-availability-and-selection-policy.md §2.1 for why that
    // equivalence is load-bearing. Runs on `this.client` (the open transaction),
    // per directives/cqrs_pattern.md's "read the source of truth mid-flight" rule.
    const overlapping = await this.client.appointment.findMany({
      where: {
        dealershipId,
        status: 'SCHEDULED',
        startAt: { lt: window.endAt },
        endAt: { gt: window.startAt },
      },
      select: { serviceBayId: true, technicianId: true },
    })

    return {
      serviceBayIds: new Set(overlapping.map((row) => row.serviceBayId)),
      technicianIds: new Set(overlapping.map((row) => row.technicianId)),
    }
  }

  async findById(appointmentId: string): Promise<Appointment | null> {
    const row = await this.client.appointment.findUnique({ where: { id: appointmentId } })
    return row ? AppointmentMapper.toDomain(row) : null
  }

  async save(appointment: Appointment): Promise<void> {
    try {
      await this.client.appointment.create({ data: AppointmentMapper.toPersistence(appointment) })
    } catch (error) {
      // The application-level check in findBusyResourceIds() already passed by
      // the time this INSERT runs — if the database still rejects it, a
      // concurrent transaction committed the same bay or technician in between.
      // This is ADR-0002's guarantee firing, not a bug in the check above.
      const constraint = this.exclusionViolationDetector.detect(error)
      if (constraint === 'service_bay') {
        throw new AppointmentSlotConflictError('service_bay_taken_concurrently')
      }
      if (constraint === 'technician') {
        throw new AppointmentSlotConflictError('technician_taken_concurrently')
      }
      throw error
    }
  }

  async update(appointment: Appointment): Promise<void> {
    // Only `status` is ever mutated post-creation (cancel). Scoping the SET to
    // that one field, rather than writing every column back, keeps this method
    // honest about what "update" means for an Appointment today.
    await this.client.appointment.update({
      where: { id: appointment.id },
      data: { status: appointment.status },
    })
  }
}
