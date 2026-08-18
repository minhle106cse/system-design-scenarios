import type { Prisma } from '@prisma/client'
import type {
  IAssignmentRepository,
  AssignmentInput,
} from '../../domain/repositories/assignment.repository'
import type { Assignment, AssignmentSource } from '../../domain/entities/assignment.entity'

type AssignmentRow = {
  id: string
  scheduleId: string
  staffId: string
  shiftId: string
  dayOfWeek: number
  source: string
}

function toDomain(row: AssignmentRow): Assignment {
  return {
    id: row.id,
    scheduleId: row.scheduleId,
    staffId: row.staffId,
    shiftId: row.shiftId,
    dayOfWeek: row.dayOfWeek,
    source: row.source as AssignmentSource,
  }
}

export class PrismaAssignmentRepository implements IAssignmentRepository {
  constructor(private readonly tx: Prisma.TransactionClient) {}

  async listByScheduleId(scheduleId: string): Promise<Assignment[]> {
    const rows = await this.tx.assignment.findMany({ where: { scheduleId } })
    return rows.map(toDomain)
  }

  async replaceAll(
    scheduleId: string,
    assignments: readonly AssignmentInput[],
  ): Promise<Assignment[]> {
    // Full replace, never a partial patch (assumption 11) — auto-schedule and any re-generate are
    // idempotent by construction: running twice yields the same roster.
    await this.tx.assignment.deleteMany({ where: { scheduleId } })
    if (assignments.length === 0) return []
    await this.tx.assignment.createMany({
      data: assignments.map((a) => ({
        scheduleId,
        staffId: a.staffId,
        shiftId: a.shiftId,
        dayOfWeek: a.dayOfWeek,
        source: a.source,
      })),
    })
    return this.listByScheduleId(scheduleId)
  }

  async findById(id: string): Promise<Assignment | null> {
    const row = await this.tx.assignment.findUnique({ where: { id } })
    return row ? toDomain(row) : null
  }

  async create(scheduleId: string, data: AssignmentInput): Promise<Assignment> {
    const row = await this.tx.assignment.create({
      data: {
        scheduleId,
        staffId: data.staffId,
        shiftId: data.shiftId,
        dayOfWeek: data.dayOfWeek,
        source: data.source,
      },
    })
    return toDomain(row)
  }

  async delete(id: string): Promise<void> {
    await this.tx.assignment.delete({ where: { id } })
  }
}
