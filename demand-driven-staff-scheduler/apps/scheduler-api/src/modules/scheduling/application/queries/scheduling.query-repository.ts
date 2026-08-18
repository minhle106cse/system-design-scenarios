import type { Schedule } from '../../domain/entities/schedule.entity'
import type { StaffMember } from '../../domain/entities/staff-member.entity'
import type { Shift } from '../../domain/entities/shift.entity'
import type { DemandCell } from '../../domain/entities/demand-cell.entity'
import type { Assignment } from '../../domain/entities/assignment.entity'
import type { ScheduleRun } from '../../domain/entities/schedule-run.entity'

/** Query-side read model — the plain Prisma client, no transaction (directives/cqrs_pattern.md §2). */
export interface ScheduleDetail {
  readonly schedule: Schedule
  readonly staff: readonly StaffMember[]
  readonly shifts: readonly Shift[]
  readonly demandCells: readonly DemandCell[]
  readonly assignments: readonly Assignment[]
  readonly latestRun: ScheduleRun | null
}

export const SCHEDULING_QUERY_REPOSITORY = Symbol('SCHEDULING_QUERY_REPOSITORY')

export interface ISchedulingQueryRepository {
  findScheduleDetail(scheduleId: string): Promise<ScheduleDetail | null>
}
