import type { Prisma } from '@prisma/client'
import type {
  IScheduleRunRepository,
  CreateScheduleRunData,
} from '../../domain/repositories/schedule-run.repository'
import type { ScheduleRun } from '../../domain/entities/schedule-run.entity'

type ScheduleRunRow = {
  id: string
  scheduleId: string
  generatedAt: Date
  parameters: unknown
  diagnostics: unknown
}

function toDomain(row: ScheduleRunRow): ScheduleRun {
  return {
    id: row.id,
    scheduleId: row.scheduleId,
    generatedAt: row.generatedAt,
    parameters: row.parameters,
    diagnostics: row.diagnostics,
  }
}

export class PrismaScheduleRunRepository implements IScheduleRunRepository {
  constructor(private readonly tx: Prisma.TransactionClient) {}

  async create(data: CreateScheduleRunData): Promise<ScheduleRun> {
    const row = await this.tx.scheduleRun.create({
      data: {
        scheduleId: data.scheduleId,
        parameters: data.parameters as Prisma.InputJsonValue,
        diagnostics: data.diagnostics as Prisma.InputJsonValue,
      },
    })
    return toDomain(row)
  }

  async findLatestByScheduleId(scheduleId: string): Promise<ScheduleRun | null> {
    const row = await this.tx.scheduleRun.findFirst({
      where: { scheduleId },
      orderBy: { generatedAt: 'desc' },
    })
    return row ? toDomain(row) : null
  }
}
