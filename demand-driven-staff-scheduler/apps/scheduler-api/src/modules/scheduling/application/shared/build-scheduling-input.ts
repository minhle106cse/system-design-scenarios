import type { DayOfWeek, DemandGrid, SchedulingInput } from '@scheduler/scheduling-core'
import type { Schedule } from '../../domain/entities/schedule.entity'
import type { StaffMember } from '../../domain/entities/staff-member.entity'
import type { Shift } from '../../domain/entities/shift.entity'
import type { DemandCell } from '../../domain/entities/demand-cell.entity'

/**
 * `AutoScheduleHandler` and `AddAssignmentHandler` both need to hand `@scheduler/scheduling-core`
 * the exact same `SchedulingInput` shape (auto-schedule calls `generateRoster`, manual roster
 * editing calls `validateRoster` — same `FeasibilityGate`, same rules, `index.ts`'s own docstring:
 * "one implementation of the rules, two callers ... a second copy is how the two paths drift").
 * That warning is about the gate itself, but the same drift risk exists one layer up, in how the
 * Prisma rows get shaped into `SchedulingInput` — so it's factored out here rather than duplicated.
 */
export function buildSchedulingInput(
  schedule: Schedule,
  staff: readonly StaffMember[],
  shifts: readonly Shift[],
  demandCells: readonly DemandCell[],
): SchedulingInput {
  const demandBuilder = new Map<DayOfWeek, Map<number, number>>()
  for (const cell of demandCells) {
    const day = cell.dayOfWeek as DayOfWeek
    const dayMap = demandBuilder.get(day) ?? new Map<number, number>()
    dayMap.set(cell.hour, cell.transactions)
    demandBuilder.set(day, dayMap)
  }
  const demand: DemandGrid = demandBuilder

  return {
    staff: staff.map((s) => ({ id: s.id, name: s.name, maxWeeklyHours: s.maxWeeklyHours })),
    shifts: shifts.map((s) => ({
      id: s.id,
      label: s.label,
      startMinute: s.startMinute,
      endMinute: s.endMinute,
    })),
    demand,
    parameters: {
      transactionsPerStaffHour: schedule.transactionsPerStaffHour,
      minStaffWhenOpen: schedule.minStaffWhenOpen,
      ...(schedule.maxStaffPerHour !== null && { maxStaffPerHour: schedule.maxStaffPerHour }),
      minUtilisationTarget: schedule.minUtilisationTarget,
    },
  }
}
