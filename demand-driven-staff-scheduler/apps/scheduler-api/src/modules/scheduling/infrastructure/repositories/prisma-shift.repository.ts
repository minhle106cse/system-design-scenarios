import type { Prisma } from '@prisma/client'
import type {
  IShiftRepository,
  CreateShiftData,
  UpdateShiftData,
} from '../../domain/repositories/shift.repository'
import type { Shift } from '../../domain/entities/shift.entity'
import { touchSchedule } from './touch-schedule.util'

type ShiftRow = {
  id: string
  scheduleId: string
  label: string
  startMinute: number
  endMinute: number
}

function toDomain(row: ShiftRow): Shift {
  return {
    id: row.id,
    scheduleId: row.scheduleId,
    label: row.label,
    startMinute: row.startMinute,
    endMinute: row.endMinute,
  }
}

export class PrismaShiftRepository implements IShiftRepository {
  constructor(private readonly tx: Prisma.TransactionClient) {}

  async create(data: CreateShiftData): Promise<Shift> {
    const row = await this.tx.shift.create({
      data: {
        scheduleId: data.scheduleId,
        label: data.label,
        startMinute: data.startMinute,
        endMinute: data.endMinute,
      },
    })
    await touchSchedule(this.tx, row.scheduleId, 'shifts')
    return toDomain(row)
  }

  async findById(id: string): Promise<Shift | null> {
    const row = await this.tx.shift.findUnique({ where: { id } })
    return row ? toDomain(row) : null
  }

  async listByScheduleId(scheduleId: string): Promise<Shift[]> {
    const rows = await this.tx.shift.findMany({
      where: { scheduleId },
      orderBy: { startMinute: 'asc' },
    })
    return rows.map(toDomain)
  }

  async update(id: string, data: UpdateShiftData): Promise<Shift> {
    const row = await this.tx.shift.update({
      where: { id },
      data: {
        ...(data.label !== undefined && { label: data.label }),
        ...(data.startMinute !== undefined && { startMinute: data.startMinute }),
        ...(data.endMinute !== undefined && { endMinute: data.endMinute }),
      },
    })
    await touchSchedule(this.tx, row.scheduleId, 'shifts')
    return toDomain(row)
  }

  async softDelete(id: string): Promise<void> {
    const row = await this.tx.shift.update({ where: { id }, data: { deletedAt: new Date() } })
    await touchSchedule(this.tx, row.scheduleId, 'shifts')
  }
}
