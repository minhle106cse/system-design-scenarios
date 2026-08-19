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
  type UnfilledSeat,
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
      return `${staffName} isn't available for ${shiftLabel} — clear the block on the Staff tab or pick someone else.`
    case 'UNKNOWN_REFERENCE':
      return `That staff member or shift no longer exists on this schedule.`
  }
}

/**
 * The same `ReasonCode` union as `reasonCopy`, but for a seat nobody could fill rather than one
 * named person — `Diagnostics.unfilledSeats.blockedReasons` reports why EVERY remaining candidate
 * was refused, so the copy has to be about the team, not an individual. Both screens that render
 * unfilled seats (Schedule, after a run; Coverage, live) go through here; one of them used to
 * print the raw enum (`WOULD_EXCEED_MAX_HOURS, UNAVAILABLE`) straight at the manager, which
 * `frontend_standard.md` §1 rule 1 forbids.
 */
function blockedReasonCopy(reason: ReasonCode): string {
  switch (reason) {
    case 'WOULD_EXCEED_MAX_HOURS':
      return 'everyone else is at their weekly limit'
    case 'OVERLAPS_EXISTING_SHIFT':
      return 'everyone else already works an overlapping shift that day'
    case 'ALREADY_ASSIGNED':
      return 'everyone eligible is already on this shift'
    case 'UNAVAILABLE':
      return 'everyone else is unavailable then'
    case 'UNKNOWN_REFERENCE':
      return 'a staff member or shift on it no longer exists'
  }
}

/** Joins the reasons for one unfilled seat into a single readable clause, in the union's own
 *  order rather than the order the diagnostics happened to collect them. */
export function describeBlockedReasons(reasons: readonly ReasonCode[]): string {
  const copy = reasons.map(blockedReasonCopy)
  if (copy.length === 0) return 'no eligible staff remain'
  if (copy.length === 1) return copy[0]!
  return `${copy.slice(0, -1).join(', ')} and ${copy[copy.length - 1]!}`
}

/** One unfilled seat as a full sentence: which day, which shift, and why nobody could take it. */
export function describeUnfilledSeat(
  seat: UnfilledSeat,
  shiftById: ReadonlyMap<string, Shift>,
): string {
  const shift = shiftById.get(seat.shiftId)
  const where = shift ? `${dayLabel(seat.day)} ${shift.label}` : dayLabel(seat.day)
  return `${where} is short a person — ${describeBlockedReasons(seat.blockedReasons)}.`
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
