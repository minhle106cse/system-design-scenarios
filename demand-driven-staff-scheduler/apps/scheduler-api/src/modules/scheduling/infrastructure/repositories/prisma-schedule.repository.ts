import type { Prisma } from '@prisma/client'
import type {
  IScheduleRepository,
  CreateScheduleData,
  UpdateScheduleData,
} from '../../domain/repositories/schedule.repository'
import type { Schedule } from '../../domain/entities/schedule.entity'
import { DEFAULT_SCHEDULE_PARAMETERS } from '../../domain/entities/schedule.entity'
import { DEFAULT_SHIFTS } from '../../domain/entities/shift.entity'

type ScheduleRow = {
  id: string
  name: string
  transactionsPerStaffHour: number
  minStaffWhenOpen: number
  maxStaffPerHour: number | null
  minUtilisationTarget: number
  createdAt: Date
  updatedAt: Date
}

function toDomain(row: ScheduleRow): Schedule {
  return {
    id: row.id,
    name: row.name,
    transactionsPerStaffHour: row.transactionsPerStaffHour,
    minStaffWhenOpen: row.minStaffWhenOpen,
    maxStaffPerHour: row.maxStaffPerHour,
    minUtilisationTarget: row.minUtilisationTarget,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

export class PrismaScheduleRepository implements IScheduleRepository {
  constructor(private readonly tx: Prisma.TransactionClient) {}

  async create(data: CreateScheduleData): Promise<Schedule> {
    // Seeds the two default shifts at creation time (brief §2.4's "seed two defaults") — the only
    // place DEFAULT_SHIFTS is used; every later shift comes through DefineShiftHandler.
    const row = await this.tx.schedule.create({
      data: {
        name: data.name,
        transactionsPerStaffHour: DEFAULT_SCHEDULE_PARAMETERS.transactionsPerStaffHour,
        minStaffWhenOpen: DEFAULT_SCHEDULE_PARAMETERS.minStaffWhenOpen,
        maxStaffPerHour: DEFAULT_SCHEDULE_PARAMETERS.maxStaffPerHour,
        minUtilisationTarget: DEFAULT_SCHEDULE_PARAMETERS.minUtilisationTarget,
        shifts: { create: DEFAULT_SHIFTS.map((s) => ({ ...s })) },
      },
    })
    return toDomain(row)
  }

  async findById(id: string): Promise<Schedule | null> {
    const row = await this.tx.schedule.findUnique({ where: { id } })
    return row ? toDomain(row) : null
  }

  async update(id: string, data: UpdateScheduleData): Promise<Schedule> {
    const row = await this.tx.schedule.update({ where: { id }, data })
    return toDomain(row)
  }
}
