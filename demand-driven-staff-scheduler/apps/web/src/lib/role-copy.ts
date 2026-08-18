/** `RoleShortfall` -> copy a non-technical manager can act on — same rule as `error-copy.ts`
 *  (`frontend_standard.md` §1 rule 1). */
import type { Role, RoleShortfall, Shift } from './api-client'
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
