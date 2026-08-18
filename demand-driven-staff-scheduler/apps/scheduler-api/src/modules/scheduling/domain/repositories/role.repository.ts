import type { Role } from '../entities/role.entity'

export interface CreateRoleData {
  readonly scheduleId: string
  readonly name: string
}

export interface UpdateRoleData {
  readonly name?: string
}

export interface IRoleRepository {
  create(data: CreateRoleData): Promise<Role>
  findById(id: string): Promise<Role | null>
  listByScheduleId(scheduleId: string): Promise<Role[]>
  update(id: string, data: UpdateRoleData): Promise<Role>
  /** Hard delete — no `deletedAt` column, a config row, same class as `StaffUnavailability`.
   *  Cascades to `StaffRole`/`ShiftRoleRequirement` via the FK (schema.prisma). */
  delete(id: string): Promise<void>
}
