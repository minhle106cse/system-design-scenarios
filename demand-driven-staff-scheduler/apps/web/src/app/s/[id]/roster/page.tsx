// The persisted roster grid + manual add/remove/drag-drop + CSV export — brief §2.5's other half.
// Parameters and the auto-schedule trigger live on the Schedule tab (schedule/page.tsx).
import { getCoverage, getSchedule } from '@/lib/api-client'
import { rosterStatus } from '@/lib/staleness'
import { RosterManager } from '@/components/roster-manager'
import { RosterFreshness } from '@/components/roster-freshness'
import { RoleDiagnosticsBanners } from '@/components/role-diagnostics-banners'

export const dynamic = 'force-dynamic'

export default async function RosterPage({
  params,
}: {
  readonly params: Promise<{ readonly id: string }>
}) {
  const { id } = await params
  // getCoverage recomputes live from whatever is currently persisted (same rule Coverage itself
  // uses, docs/04_data_model.md's dated note) — so removing a role-holder here shows its
  // roleShortfall on THIS tab, on the very next render `router.refresh()` triggers, rather than
  // only on the next visit to Coverage. Real gap found reviewing this screen: the × button that
  // can break role coverage gave no feedback at all at the moment it was clicked.
  const [detail, diagnostics] = await Promise.all([getSchedule(id), getCoverage(id)])
  const status = rosterStatus(detail.schedule, detail.latestRun)

  return (
    <div className="space-y-6">
      {/* Roster shows the actual assignments rather than derived figures, but without this banner
          it gives no indication those assignments predate a later staff/shift/demand/role/parameter
          edit either — the grid does not re-render itself when the underlying inputs change. */}
      <RosterFreshness scheduleId={id} status={status} />
      <RoleDiagnosticsBanners diagnostics={diagnostics} roles={detail.roles} shifts={detail.shifts} />
      <RosterManager
        scheduleId={id}
        staff={detail.staff}
        shifts={detail.shifts}
        assignments={detail.assignments}
      />
    </div>
  )
}
