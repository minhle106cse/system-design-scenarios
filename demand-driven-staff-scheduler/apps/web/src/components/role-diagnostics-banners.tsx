import type { Diagnostics, Role, Shift } from '@/lib/api-client'
import { describeRoleCapacityGap, describeRoleShortfall } from '@/lib/role-copy'
import { Banner } from '@/components/ui/banner'

/**
 * The two role-diagnostics banners (stretch-goals plan §2a + the capacity-gap addition below),
 * factored out so Schedule, Roster, and Coverage — the three screens that can each be the first
 * place a manager notices a role problem — render the exact same copy instead of three JSX blocks
 * drifting apart. Order matters: capacity gap (the CAUSE — not enough role-holder hours exist, no
 * amount of rescheduling fixes it) before shortfall (the EFFECT — this specific seat came up short)
 * so a manager reads root cause before symptom.
 */
export function RoleDiagnosticsBanners({
  diagnostics,
  roles,
  shifts,
}: {
  readonly diagnostics: Pick<Diagnostics, 'roleCapacity' | 'roleShortfalls'>
  readonly roles: readonly Role[]
  readonly shifts: readonly Shift[]
}) {
  const roleById = new Map(roles.map((r) => [r.id, r]))
  const shiftById = new Map(shifts.map((s) => [s.id, s]))

  return (
    <>
      {diagnostics.roleCapacity
        .filter((c) => c.requiredRoleHours > c.contractedRoleHours)
        .map((c) => (
          <Banner key={c.roleId} tone="warning">
            {describeRoleCapacityGap(c, roleById)}
          </Banner>
        ))}
      {diagnostics.roleShortfalls.length > 0 && (
        <Banner tone="warning">
          <ul className="list-disc space-y-1 pl-4">
            {diagnostics.roleShortfalls.map((s, i) => (
              <li key={i}>{describeRoleShortfall(s, roleById, shiftById)}</li>
            ))}
          </ul>
        </Banner>
      )}
    </>
  )
}
