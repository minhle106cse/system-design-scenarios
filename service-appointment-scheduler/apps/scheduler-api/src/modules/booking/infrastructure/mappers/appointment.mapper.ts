import { Appointment } from '../../domain/entities/appointment.entity'
import type { Appointment as AppointmentRow, Prisma } from '@/generated'

/**
 * `toDomain` + `toPersistence` for `Appointment` — the repository delegates
 * here rather than inlining `rehydrate(...)` (`directives/domain_modeling.md` §3).
 */
export class AppointmentMapper {
  /**
   * Trusts the row. Write-side validation (Zod) plus the database constraints
   * (enum column, exclusion constraints) already guarantee validity by the time
   * a row exists — re-checking it on every read is the "validate-on-read"
   * anti-pattern `directives/domain_modeling.md` §2 forbids. `row.status` is
   * assigned straight across because its type is already the Prisma enum, not
   * `string`.
   */
  static toDomain(row: AppointmentRow): Appointment {
    return Appointment.rehydrate({
      id: row.id,
      customerId: row.customerId,
      vehicleId: row.vehicleId,
      dealershipId: row.dealershipId,
      serviceTypeId: row.serviceTypeId,
      serviceBayId: row.serviceBayId,
      technicianId: row.technicianId,
      startAt: row.startAt,
      endAt: row.endAt,
      status: row.status,
      createdAt: row.createdAt,
    })
  }

  /** Reads through getters — no `toSnapshot()` needed (`domain_modeling.md` §0). */
  static toPersistence(appointment: Appointment): Prisma.AppointmentCreateInput {
    return {
      id: appointment.id,
      customer: { connect: { id: appointment.customerId } },
      vehicle: { connect: { id: appointment.vehicleId } },
      dealership: { connect: { id: appointment.dealershipId } },
      serviceType: { connect: { id: appointment.serviceTypeId } },
      serviceBay: { connect: { id: appointment.serviceBayId } },
      technician: { connect: { id: appointment.technicianId } },
      startAt: appointment.startAt,
      endAt: appointment.endAt,
      status: appointment.status,
    }
  }
}
