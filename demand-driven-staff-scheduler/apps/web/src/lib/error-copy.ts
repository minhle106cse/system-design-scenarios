/**
 * `ApiError.code` (+ `Violation[]` on a 422 `ROSTER_VIOLATION`) into copy a non-technical manager
 * understands and can act on — `frontend_standard.md` §1 rule 1: "every red/warning cell states
 * what to do about it, not just that something is wrong."
 */
import {
  ApiError,
  type ReasonCode,
  type Shift,
  type StaffMember,
  type Violation,
} from './api-client'
import { dayLabel } from './week'

function reasonCopy(
  reason: ReasonCode,
  staffName: string,
  shiftLabel: string,
  maxWeeklyHours: number | undefined,
): string {
  switch (reason) {
    case 'WOULD_EXCEED_MAX_HOURS':
      return `${staffName} would go over ${
        maxWeeklyHours === undefined ? 'their' : `their ${maxWeeklyHours}-hour`
      } weekly limit. Raise the limit or pick someone else.`
    case 'OVERLAPS_EXISTING_SHIFT':
      return `${staffName} is already working another shift at that time. Remove the other assignment first.`
    case 'ALREADY_ASSIGNED':
      return `${staffName} is already assigned to ${shiftLabel}.`
    case 'UNAVAILABLE':
      return `${staffName} isn't available for ${shiftLabel}.`
  }
}

export function describeViolation(
  violation: Violation,
  staffById: ReadonlyMap<string, StaffMember>,
  shiftById: ReadonlyMap<string, Shift>,
): string {
  const staff = staffById.get(violation.staffId)
  const shift = shiftById.get(violation.shiftId)
  const staffName = staff?.name ?? 'This staff member'
  const shiftLabel = shift
    ? `${shift.label} on ${dayLabel(violation.day)}`
    : dayLabel(violation.day)
  return reasonCopy(violation.reason, staffName, shiftLabel, staff?.maxWeeklyHours)
}

/** The catch-all for any `ApiError` a mutation throws — a banner-ready sentence, always. */
export function describeApiError(
  err: unknown,
  lookups?: {
    readonly staffById: ReadonlyMap<string, StaffMember>
    readonly shiftById: ReadonlyMap<string, Shift>
  },
): string {
  if (!(err instanceof ApiError)) return 'Could not reach the scheduling service.'

  if (err.code === 'ROSTER_VIOLATION' && lookups) {
    const details = err.details as { violations?: readonly Violation[] } | undefined
    const violations = details?.violations ?? []
    if (violations.length > 0) {
      return violations
        .map((v) => describeViolation(v, lookups.staffById, lookups.shiftById))
        .join(' ')
    }
  }

  if (err.code === 'INVALID_SHIFT_TIME_RANGE') {
    return "A shift must end after it starts — overnight shifts aren't supported."
  }

  return err.message
}
