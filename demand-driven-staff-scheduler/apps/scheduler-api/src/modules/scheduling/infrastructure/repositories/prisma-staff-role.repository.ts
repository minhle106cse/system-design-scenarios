import type { Prisma } from '@prisma/client'
import type { IStaffRoleRepository } from '../../domain/repositories/staff-role.repository'
import type { StaffRole } from '../../domain/entities/role.entity'
import { touchSchedule } from './touch-schedule.util'

type StaffRoleRow = { id: string; staffId: string; roleId: string }

function toDomain(row: StaffRoleRow): StaffRole {
  return { id: row.id, staffId: row.staffId, roleId: row.roleId }
}

export class PrismaStaffRoleRepository implements IStaffRoleRepository {
  constructor(private readonly tx: Prisma.TransactionClient) {}

  async listByScheduleId(scheduleId: string): Promise<StaffRole[]> {
    const rows = await this.tx.staffRole.findMany({ where: { staff: { scheduleId } } })
    return rows.map(toDomain)
  }

  /** Replace-the-whole-set (assumptions 10/11's precedent) — delete then recreate inside the SAME
   *  transaction, not a diff/merge, matching `demand-cell` re-import's "clean slate" semantics. */
  async setForStaff(staffId: string, roleIds: readonly string[]): Promise<StaffRole[]> {
    await this.tx.staffRole.deleteMany({ where: { staffId } })
    if (roleIds.length > 0) {
      await this.tx.staffRole.createMany({ data: roleIds.map((roleId) => ({ staffId, roleId })) })
    }
    const rows = await this.tx.staffRole.findMany({ where: { staffId } })
    // No `scheduleId` column on this join table (schema.prisma) — one extra lookup through the
    // staff relation, same shape `listByScheduleId` already needs.
    const staff = await this.tx.staffMember.findUnique({
      where: { id: staffId },
      select: { scheduleId: true },
    })
    if (staff) await touchSchedule(this.tx, staff.scheduleId, 'roles')
    return rows.map(toDomain)
  }
}
