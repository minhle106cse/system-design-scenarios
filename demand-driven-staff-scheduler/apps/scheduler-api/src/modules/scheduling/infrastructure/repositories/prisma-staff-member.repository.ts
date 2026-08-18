import type { Prisma } from '@prisma/client'
import type {
  IStaffMemberRepository,
  CreateStaffMemberData,
  UpdateStaffMemberData,
} from '../../domain/repositories/staff-member.repository'
import type { StaffMember } from '../../domain/entities/staff-member.entity'

type StaffMemberRow = { id: string; scheduleId: string; name: string; maxWeeklyHours: number }

function toDomain(row: StaffMemberRow): StaffMember {
  return {
    id: row.id,
    scheduleId: row.scheduleId,
    name: row.name,
    maxWeeklyHours: row.maxWeeklyHours,
  }
}

export class PrismaStaffMemberRepository implements IStaffMemberRepository {
  constructor(private readonly tx: Prisma.TransactionClient) {}

  async create(data: CreateStaffMemberData): Promise<StaffMember> {
    const row = await this.tx.staffMember.create({
      data: { scheduleId: data.scheduleId, name: data.name, maxWeeklyHours: data.maxWeeklyHours },
    })
    return toDomain(row)
  }

  async findById(id: string): Promise<StaffMember | null> {
    const row = await this.tx.staffMember.findUnique({ where: { id } })
    return row ? toDomain(row) : null
  }

  async listByScheduleId(scheduleId: string): Promise<StaffMember[]> {
    const rows = await this.tx.staffMember.findMany({
      where: { scheduleId },
      orderBy: { name: 'asc' },
    })
    return rows.map(toDomain)
  }

  async update(id: string, data: UpdateStaffMemberData): Promise<StaffMember> {
    const row = await this.tx.staffMember.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.maxWeeklyHours !== undefined && { maxWeeklyHours: data.maxWeeklyHours }),
      },
    })
    return toDomain(row)
  }

  async softDelete(id: string): Promise<void> {
    await this.tx.staffMember.update({ where: { id }, data: { deletedAt: new Date() } })
  }
}
