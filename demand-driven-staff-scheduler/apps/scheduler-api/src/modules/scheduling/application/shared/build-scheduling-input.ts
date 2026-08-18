import type {
  DayOfWeek,
  DemandGrid,
  RoleId,
  SchedulingInput,
  UnavailabilityWindow,
} from '@scheduler/scheduling-core'
import type { Schedule } from '../../domain/entities/schedule.entity'
import type { StaffMember } from '../../domain/entities/staff-member.entity'
import type { Shift } from '../../domain/entities/shift.entity'
import type { DemandCell } from '../../domain/entities/demand-cell.entity'
import type { StaffUnavailability } from '../../domain/entities/staff-unavailability.entity'
import type { StaffRole, ShiftRoleRequirement } from '../../domain/entities/role.entity'

export interface BuildSchedulingInputOptions {
  readonly schedule: Schedule
  readonly staff: readonly StaffMember[]
  readonly shifts: readonly Shift[]
  readonly demandCells: readonly DemandCell[]
  /** Optional — call sites that predate H4 (or don't need it) simply omit this. */
  readonly unavailability?: readonly StaffUnavailability[]
  /** Optional — call sites that predate roles (stretch-goals plan §2b) simply omit these. */
  readonly staffRoles?: readonly StaffRole[]
  readonly shiftRoleRequirements?: readonly ShiftRoleRequirement[]
}

/**
 * `AutoScheduleHandler`, `AddAssignmentHandler`, `GetCoverageHandler`, and `SuggestNHandler` all
 * need to hand `@scheduler/scheduling-core` the exact same `SchedulingInput` shape (auto-schedule
 * calls `generateRoster`, manual roster editing calls `validateRoster` — same `FeasibilityGate`,
 * same rules, `index.ts`'s own docstring: "one implementation of the rules, two callers ... a
 * second copy is how the two paths drift"). That warning is about the gate itself, but the same
 * drift risk exists one layer up, in how the Prisma rows get shaped into `SchedulingInput` — so
 * it's factored out here rather than duplicated.
 *
 * Options-object signature (stretch-goals plan §1b, 2026-08-18): was four positional arguments;
 * widened here rather than adding a fifth (`unavailability`) and, since then, a sixth/seventh
 * (`staffRoles`/`shiftRoleRequirements`, plan §2b) as more positional params call sites would have
 * had to thread through in the exact right order.
 */
export function buildSchedulingInput(options: BuildSchedulingInputOptions): SchedulingInput {
  const {
    schedule,
    staff,
    shifts,
    demandCells,
    unavailability = [],
    staffRoles = [],
    shiftRoleRequirements = [],
  } = options

  const demandBuilder = new Map<DayOfWeek, Map<number, number>>()
  for (const cell of demandCells) {
    const day = cell.dayOfWeek as DayOfWeek
    const dayMap = demandBuilder.get(day) ?? new Map<number, number>()
    dayMap.set(cell.hour, cell.transactions)
    demandBuilder.set(day, dayMap)
  }
  const demand: DemandGrid = demandBuilder

  const windowsByStaffId = new Map<string, UnavailabilityWindow[]>()
  for (const w of unavailability) {
    const windows = windowsByStaffId.get(w.staffId) ?? []
    windows.push({
      day: w.dayOfWeek as DayOfWeek,
      startMinute: w.startMinute,
      endMinute: w.endMinute,
    })
    windowsByStaffId.set(w.staffId, windows)
  }

  const roleIdsByStaffId = new Map<string, RoleId[]>()
  for (const sr of staffRoles) {
    const roleIds = roleIdsByStaffId.get(sr.staffId) ?? []
    roleIds.push(sr.roleId)
    roleIdsByStaffId.set(sr.staffId, roleIds)
  }

  const requirementsByShiftId = new Map<string, { roleId: RoleId; minCount: number }[]>()
  for (const r of shiftRoleRequirements) {
    const reqs = requirementsByShiftId.get(r.shiftId) ?? []
    reqs.push({ roleId: r.roleId, minCount: r.minCount })
    requirementsByShiftId.set(r.shiftId, reqs)
  }

  return {
    staff: staff.map((s) => ({
      id: s.id,
      name: s.name,
      maxWeeklyHours: s.maxWeeklyHours,
      ...(windowsByStaffId.has(s.id) && { unavailability: windowsByStaffId.get(s.id)! }),
      ...(roleIdsByStaffId.has(s.id) && { roles: roleIdsByStaffId.get(s.id)! }),
    })),
    shifts: shifts.map((s) => ({
      id: s.id,
      label: s.label,
      startMinute: s.startMinute,
      endMinute: s.endMinute,
      ...(requirementsByShiftId.has(s.id) && {
        roleRequirements: requirementsByShiftId.get(s.id)!,
      }),
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
