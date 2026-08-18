import { Injectable } from '@nestjs/common'
import type { IRepoFactory } from '@scheduler/shared-kernel'
import type { Prisma } from '@prisma/client'
import { PrismaScheduleRepository } from '@/modules/scheduling/infrastructure/repositories/prisma-schedule.repository'
import { PrismaStaffMemberRepository } from '@/modules/scheduling/infrastructure/repositories/prisma-staff-member.repository'
import { PrismaShiftRepository } from '@/modules/scheduling/infrastructure/repositories/prisma-shift.repository'
import { PrismaDemandCellRepository } from '@/modules/scheduling/infrastructure/repositories/prisma-demand-cell.repository'
import { PrismaAssignmentRepository } from '@/modules/scheduling/infrastructure/repositories/prisma-assignment.repository'
import { PrismaScheduleRunRepository } from '@/modules/scheduling/infrastructure/repositories/prisma-schedule-run.repository'
import { PrismaStaffUnavailabilityRepository } from '@/modules/scheduling/infrastructure/repositories/prisma-staff-unavailability.repository'
import { PrismaRoleRepository } from '@/modules/scheduling/infrastructure/repositories/prisma-role.repository'
import { PrismaStaffRoleRepository } from '@/modules/scheduling/infrastructure/repositories/prisma-staff-role.repository'
import { PrismaShiftRoleRequirementRepository } from '@/modules/scheduling/infrastructure/repositories/prisma-shift-role-requirement.repository'
import type { IScheduleRepository } from '@/modules/scheduling/domain/repositories/schedule.repository'
import type { IStaffMemberRepository } from '@/modules/scheduling/domain/repositories/staff-member.repository'
import type { IShiftRepository } from '@/modules/scheduling/domain/repositories/shift.repository'
import type { IDemandCellRepository } from '@/modules/scheduling/domain/repositories/demand-cell.repository'
import type { IAssignmentRepository } from '@/modules/scheduling/domain/repositories/assignment.repository'
import type { IScheduleRunRepository } from '@/modules/scheduling/domain/repositories/schedule-run.repository'
import type { IStaffUnavailabilityRepository } from '@/modules/scheduling/domain/repositories/staff-unavailability.repository'
import type { IRoleRepository } from '@/modules/scheduling/domain/repositories/role.repository'
import type { IStaffRoleRepository } from '@/modules/scheduling/domain/repositories/staff-role.repository'
import type { IShiftRoleRequirementRepository } from '@/modules/scheduling/domain/repositories/shift-role-requirement.repository'

/**
 * Write-side Unit of Work for the whole service (docs/adr/0005-transaction-retry-boundary.md).
 * One repos shape for the whole service, not one per module — `scheduling` is the only domain
 * module at this scope, so this factory has exactly one caller's worth of repositories, but the
 * shape stays service-wide on purpose (see shared-kernel's tx-scope.ts doc for why a per-module
 * registry is the wrong shape to reach for even with one module today).
 */
export interface SchedulerApiRepos {
  readonly schedules: IScheduleRepository
  readonly staff: IStaffMemberRepository
  readonly shifts: IShiftRepository
  readonly demandCells: IDemandCellRepository
  readonly assignments: IAssignmentRepository
  readonly runs: IScheduleRunRepository
  readonly unavailability: IStaffUnavailabilityRepository
  readonly roles: IRoleRepository
  readonly staffRoles: IStaffRoleRepository
  readonly shiftRoleRequirements: IShiftRoleRequirementRepository
}

@Injectable()
export class SchedulerApiRepoFactory implements IRepoFactory<
  SchedulerApiRepos,
  Prisma.TransactionClient
> {
  // The transaction client is threaded straight into each repository's constructor — this is the
  // ONE place `Prisma.TransactionClient` is handed out, which is what makes "a repository in here
  // has a transaction" true by construction rather than by convention (ADR-0005).
  create(tx: Prisma.TransactionClient): SchedulerApiRepos {
    return {
      schedules: new PrismaScheduleRepository(tx),
      staff: new PrismaStaffMemberRepository(tx),
      shifts: new PrismaShiftRepository(tx),
      demandCells: new PrismaDemandCellRepository(tx),
      assignments: new PrismaAssignmentRepository(tx),
      runs: new PrismaScheduleRunRepository(tx),
      unavailability: new PrismaStaffUnavailabilityRepository(tx),
      roles: new PrismaRoleRepository(tx),
      staffRoles: new PrismaStaffRoleRepository(tx),
      shiftRoleRequirements: new PrismaShiftRoleRequirementRepository(tx),
    }
  }
}
