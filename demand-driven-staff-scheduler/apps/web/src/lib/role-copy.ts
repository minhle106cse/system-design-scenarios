/** `RoleShortfall`/`RoleCapacity` -> copy a non-technical manager can act on — same rule as
 *  `error-copy.ts` (`frontend_standard.md` §1 rule 1). */
import type { Role, RoleCapacity, RoleShortfall, Shift } from './api-client'
import { formatHours } from './format'
import { dayLabel } from './week'

export function describeRoleShortfall(
  shortfall: RoleShortfall,
  roleById: ReadonlyMap<string, Role>,
  shiftById: ReadonlyMap<string, Shift>,
): string {
  const roleName = roleById.get(shortfall.roleId)?.name ?? 'a required role'
  const shift = shiftById.get(shortfall.shiftId)
  const shiftLabel = shift ? `${dayLabel(shortfall.day)} ${shift.label}` : dayLabel(shortfall.day)
  const missing = shortfall.required - shortfall.assigned
  const has =
    shortfall.assigned === 0
      ? `no ${roleName} (needs ${shortfall.required})`
      : `only ${shortfall.assigned}/${shortfall.required} ${roleName} (${missing} more needed)`
  return `${shiftLabel} has ${has}. Assign one, or lower the requirement on the Shifts tab.`
}

/**
 * Only called for a `RoleCapacity` entry where `requiredRoleHours > contractedRoleHours` — the
 * genuine-staffing-gap case, distinct from a `roleShortfall` fill-order artifact. Names the role by
 * how many holders back it (not by name — `RoleCapacity` doesn't carry a holder list, only the
 * aggregate hours), so the copy stays honest about what it actually knows.
 */
export function describeRoleCapacityGap(gap: RoleCapacity, roleById: ReadonlyMap<string, Role>): string {
  const roleName = roleById.get(gap.roleId)?.name ?? 'a required role'
  return (
    `${roleName} needs ${formatHours(gap.requiredRoleHours)} of coverage this week, but the ` +
    `people holding that role are only contracted for ${formatHours(gap.contractedRoleHours)} ` +
    `combined — no amount of rescheduling can close that gap. Add another ${roleName}, or raise ` +
    `their hours, or lower the requirement on the Shifts tab.`
  )
}
