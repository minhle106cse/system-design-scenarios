import { ApplicationError } from '@scheduler/shared-kernel'
import type { Violation } from '@scheduler/scheduling-core'

/**
 * Domain errors for the `scheduling` module. `ApplicationError` supplies neither `code` nor
 * `statusCode`, so every subclass declares both — `GlobalExceptionFilter` reads exactly those two
 * fields plus `message` and `details`.
 */

export class ScheduleNotFoundError extends ApplicationError {
  readonly code = 'SCHEDULE_NOT_FOUND'
  readonly statusCode = 404

  constructor(scheduleId: string) {
    super('Schedule not found', { scheduleId })
  }
}

export class StaffMemberNotFoundError extends ApplicationError {
  readonly code = 'STAFF_MEMBER_NOT_FOUND'
  readonly statusCode = 404

  constructor(staffId: string) {
    super('Staff member not found', { staffId })
  }
}

export class ShiftNotFoundError extends ApplicationError {
  readonly code = 'SHIFT_NOT_FOUND'
  readonly statusCode = 404

  constructor(shiftId: string) {
    super('Shift not found', { shiftId })
  }
}

/**
 * A partial shift update (only `startMinute` OR only `endMinute`) passes createShiftSchema's
 * refine independently field-by-field, so a patch that is individually well-typed can still merge
 * with the EXISTING row into `endMinute <= startMinute` — Zod alone cannot see the existing row
 * (`directives/zod_validation.md` §4 governs request-shape validation, not this). Same domain-
 * constraint class as `FeasibilityGate`: enforced on already-well-typed data, not a second input
 * validator (assumption 3, no overnight shifts).
 */
export class AssignmentNotFoundError extends ApplicationError {
  readonly code = 'ASSIGNMENT_NOT_FOUND'
  readonly statusCode = 404

  constructor(assignmentId: string) {
    super('Assignment not found', { assignmentId })
  }
}

/**
 * Brief's manual-roster-edit path (stretch goal) — the candidate assignment, replayed through the
 * SAME `FeasibilityGate` `generateRoster` uses (`validateRoster`, `packages/scheduling-core`'s
 * `index.ts` docstring: "one implementation of the rules, two callers"), failed at least one hard
 * constraint. `violations` carries scheduling-core's own `Violation[]` shape verbatim — no
 * re-encoding, so the reason codes the client sees match `docs/adr/0001-*.md`'s table exactly.
 */
export class RosterViolationError extends ApplicationError {
  readonly code = 'ROSTER_VIOLATION'
  readonly statusCode = 422

  constructor(violations: readonly Violation[]) {
    super('Assignment violates a scheduling constraint', { violations })
  }
}

export class InvalidShiftTimeRangeError extends ApplicationError {
  readonly code = 'INVALID_SHIFT_TIME_RANGE'
  readonly statusCode = 422

  constructor(startMinute: number, endMinute: number) {
    super('endMinute must be greater than startMinute (no overnight shifts)', {
      startMinute,
      endMinute,
    })
  }
}

/**
 * Guard for `GET /schedules/:id/suggested-n` (and any other calibration query). Every one of
 * `suggestTransactionsPerStaff`'s edge cases (empty staff, empty shifts, empty demand) is already
 * handled without throwing inside `@scheduler/scheduling-core` (`demand-model.ts`,
 * `shift-requirements.ts` pin these deliberately — closed hour / zero-length shift ⇒ 0, not NaN),
 * so this is NOT a crash guard. It exists because the algorithm degrades to a near-meaningless
 * answer (`bestN` collapses to `1`) when one of the three inputs is missing — surfacing that as a
 * 422 up front is more honest than returning a number that looks legitimate but isn't.
 */
export class InsufficientCalibrationDataError extends ApplicationError {
  readonly code = 'INSUFFICIENT_CALIBRATION_DATA'
  readonly statusCode = 422

  constructor(missing: { staff: boolean; shifts: boolean; demand: boolean }) {
    const parts: string[] = []
    if (missing.staff) parts.push('staff')
    if (missing.shifts) parts.push('shifts')
    if (missing.demand) parts.push('demand data')
    super(
      `Cannot suggest transactionsPerStaffHour: no ${parts.join(', ')} on this schedule`,
      missing,
    )
  }
}
