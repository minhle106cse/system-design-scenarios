import type { Prisma } from '@prisma/client'
import type {
  IStaffUnavailabilityRepository,
  CreateStaffUnavailabilityData,
} from '../../domain/repositories/staff-unavailability.repository'
import type { StaffUnavailability } from '../../domain/entities/staff-unavailability.entity'

type StaffUnavailabilityRow = {
  id: string
  staffId: string
  dayOfWeek: number
  startMinute: number
  endMinute: number
}

function toDomain(row: StaffUnavailabilityRow): StaffUnavailability {
  return {
    id: row.id,
    staffId: row.staffId,
    dayOfWeek: row.dayOfWeek,
    startMinute: row.startMinute,
    endMinute: row.endMinute,
  }
}

export class PrismaStaffUnavailabilityRepository implements IStaffUnavailabilityRepository {
  constructor(private readonly tx: Prisma.TransactionClient) {}

  async create(data: CreateStaffUnavailabilityData): Promise<StaffUnavailability> {
    const row = await this.tx.staffUnavailability.create({
      data: {
        staffId: data.staffId,
        dayOfWeek: data.dayOfWeek,
        startMinute: data.startMinute,
        endMinute: data.endMinute,
      },
    })
    return toDomain(row)
  }

  async findById(id: string): Promise<StaffUnavailability | null> {
    const row = await this.tx.staffUnavailability.findUnique({ where: { id } })
    return row ? toDomain(row) : null
  }

  /** No direct `scheduleId` column — filtered through the `staff` relation, same shape a join query needs. */
  async listByScheduleId(scheduleId: string): Promise<StaffUnavailability[]> {
    const rows = await this.tx.staffUnavailability.findMany({
      where: { staff: { scheduleId } },
    })
    return rows.map(toDomain)
  }

  async delete(id: string): Promise<void> {
    await this.tx.staffUnavailability.delete({ where: { id } })
  }
}
