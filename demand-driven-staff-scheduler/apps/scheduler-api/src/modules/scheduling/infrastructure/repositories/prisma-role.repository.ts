import { Prisma } from '@prisma/client'
import type {
  IRoleRepository,
  CreateRoleData,
  UpdateRoleData,
} from '../../domain/repositories/role.repository'
import type { Role } from '../../domain/entities/role.entity'
import { DuplicateRoleNameError } from '@/common/errors/scheduling.error'

type RoleRow = { id: string; scheduleId: string; name: string }

function toDomain(row: RoleRow): Role {
  return { id: row.id, scheduleId: row.scheduleId, name: row.name }
}

export class PrismaRoleRepository implements IRoleRepository {
  constructor(private readonly tx: Prisma.TransactionClient) {}

  async create(data: CreateRoleData): Promise<Role> {
    try {
      const row = await this.tx.role.create({
        data: { scheduleId: data.scheduleId, name: data.name },
      })
      return toDomain(row)
    } catch (err) {
      // `@@unique([scheduleId, name])` (schema.prisma) — turn the raw P2002 into the same domain-
      // error envelope every other write path uses, rather than letting it surface as a 500.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new DuplicateRoleNameError(data.name)
      }
      throw err
    }
  }

  async findById(id: string): Promise<Role | null> {
    const row = await this.tx.role.findUnique({ where: { id } })
    return row ? toDomain(row) : null
  }

  async listByScheduleId(scheduleId: string): Promise<Role[]> {
    const rows = await this.tx.role.findMany({ where: { scheduleId }, orderBy: { name: 'asc' } })
    return rows.map(toDomain)
  }

  async update(id: string, data: UpdateRoleData): Promise<Role> {
    try {
      const row = await this.tx.role.update({
        where: { id },
        data: { ...(data.name !== undefined && { name: data.name }) },
      })
      return toDomain(row)
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new DuplicateRoleNameError(data.name ?? '')
      }
      throw err
    }
  }

  async delete(id: string): Promise<void> {
    await this.tx.role.delete({ where: { id } })
  }
}
