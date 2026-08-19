import type { Assignment, AssignmentSource } from '../entities/assignment.entity'

export interface AssignmentInput {
  readonly staffId: string
  readonly shiftId: string
  readonly dayOfWeek: number
  readonly source: AssignmentSource
}

export interface IAssignmentRepository {
  listByScheduleId(scheduleId: string): Promise<Assignment[]>
  /** Full replace — auto-schedule and a re-generate both overwrite the whole roster (assumption 11). */
  replaceAll(scheduleId: string, assignments: readonly AssignmentInput[]): Promise<Assignment[]>
  findById(id: string): Promise<Assignment | null>
  /** The one write manual roster editing uses — a single, `FeasibilityGate`-approved assignment. */
  create(scheduleId: string, data: AssignmentInput): Promise<Assignment>
  /** Hard delete — `Assignment` has no `deletedAt` column (schema.prisma), unlike Schedule/Staff/Shift. */
  delete(id: string): Promise<void>
  /**
   * Cascade for a removed staff member / shift. Staff and Shift are SOFT-deleted, so their rows
   * survive, but an assignment pointing at a removed one is meaningless — and actively harmful:
   * `FeasibilityGate.eligible` THROWS on a staffId missing from `SchedulingInput.staff`
   * (by design — it treats that as a caller bug, not a feasibility case), so a dangling
   * assignment turned every later coverage read into a 500.
   */
  deleteByStaffId(staffId: string): Promise<number>
  deleteByShiftId(shiftId: string): Promise<number>
}
