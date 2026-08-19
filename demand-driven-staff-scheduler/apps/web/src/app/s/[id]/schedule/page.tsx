// Parameters + auto-schedule trigger — brief §2.5's parameter panel, split from Roster (which now
// only shows/edits the resulting grid — see roster/page.tsx).
import { ApiError, getSchedule, getSuggestedN, type SuggestedN } from '@/lib/api-client'
import { rosterStatus } from '@/lib/staleness'
import { ScheduleManager } from '@/components/schedule-manager'
import { RosterFreshness } from '@/components/roster-freshness'

export const dynamic = 'force-dynamic'

/** `suggested-n` 422s (`INSUFFICIENT_CALIBRATION_DATA`) until staff/shifts/demand all exist —
 *  a schedule missing one of those is a normal early state, not a page-breaking error. */
async function getSuggestedNSafe(scheduleId: string): Promise<SuggestedN | null> {
  try {
    return await getSuggestedN(scheduleId)
  } catch (err) {
    if (err instanceof ApiError && err.code === 'INSUFFICIENT_CALIBRATION_DATA') return null
    throw err
  }
}

export default async function SchedulePage({
  params,
}: {
  readonly params: Promise<{ readonly id: string }>
}) {
  const { id } = await params
  const [detail, suggestedN] = await Promise.all([getSchedule(id), getSuggestedNSafe(id)])
  const status = rosterStatus(detail.schedule, detail.latestRun)

  return (
    <div className="space-y-6">
      <RosterFreshness scheduleId={id} status={status} />
      <ScheduleManager
        scheduleId={id}
        schedule={detail.schedule}
        staffCount={detail.staff.length}
        shifts={detail.shifts}
        roles={detail.roles}
        latestRun={detail.latestRun}
        suggestedN={suggestedN}
      />
    </div>
  )
}
