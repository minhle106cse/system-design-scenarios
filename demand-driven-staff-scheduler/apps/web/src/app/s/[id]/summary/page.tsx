// Aggregated summary — brief §2.6: per (day, hour) transactions/staff-hours/ratio + week totals.
import { getSchedule, getSummary } from '@/lib/api-client'
import { rosterStatus } from '@/lib/staleness'
import { SummaryView } from '@/components/summary-view'
import { RosterFreshness } from '@/components/roster-freshness'

export const dynamic = 'force-dynamic'

export default async function SummaryPage({
  params,
}: {
  readonly params: Promise<{ readonly id: string }>
}) {
  const { id } = await params
  // Both calls hit URLs the layout already fetched, so Next's per-request memoization collapses
  // the duplicate `getSchedule` rather than issuing a second round trip.
  const [report, detail] = await Promise.all([getSummary(id), getSchedule(id)])
  const status = rosterStatus(detail.schedule, detail.latestRun)

  return (
    <div className="space-y-6">
      <RosterFreshness scheduleId={id} status={status} />
      <SummaryView report={report} />
    </div>
  )
}
