import type { Prisma } from '@prisma/client'
import type {
  IShiftRoleRequirementRepository,
  ShiftRoleRequirementInput,
} from '../../domain/repositories/shift-role-requirement.repository'
import type { ShiftRoleRequirement } from '../../domain/entities/role.entity'
import { touchSchedule } from './touch-schedule.util'

type ShiftRoleRequirementRow = { id: string; shiftId: string; roleId: string; minCount: number }

function toDomain(row: ShiftRoleRequirementRow): ShiftRoleRequirement {
  return { id: row.id, shiftId: row.shiftId, roleId: row.roleId, minCount: row.minCount }
}

export class PrismaShiftRoleRequirementRepository implements IShiftRoleRequirementRepository {
  constructor(private readonly tx: Prisma.TransactionClient) {}

  async listByScheduleId(scheduleId: string): Promise<ShiftRoleRequirement[]> {
    const rows = await this.tx.shiftRoleRequirement.findMany({ where: { shift: { scheduleId } } })
    return rows.map(toDomain)
  }

  async setForShift(
    shiftId: string,
    requirements: readonly ShiftRoleRequirementInput[],
  ): Promise<ShiftRoleRequirement[]> {
    await this.tx.shiftRoleRequirement.deleteMany({ where: { shiftId } })
    if (requirements.length > 0) {
      await this.tx.shiftRoleRequirement.createMany({
        data: requirements.map((r) => ({ shiftId, roleId: r.roleId, minCount: r.minCount })),
      })
    }
    const rows = await this.tx.shiftRoleRequirement.findMany({ where: { shiftId } })
    // No `scheduleId` column on this join table (schema.prisma) — one extra lookup through the
    // shift relation, same shape `listByScheduleId` already needs.
    const shift = await this.tx.shift.findUnique({
      where: { id: shiftId },
      select: { scheduleId: true },
    })
    if (shift) await touchSchedule(this.tx, shift.scheduleId, 'roles')
    return rows.map(toDomain)
  }
}
