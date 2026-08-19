// Coverage view — brief §8 stretch: required vs scheduled per hour, live from the persisted roster.
import { getCoverage, getSchedule } from '@/lib/api-client'
import { rosterStatus } from '@/lib/staleness'
import { CoverageView } from '@/components/coverage-view'
import { RosterFreshness } from '@/components/roster-freshness'

export const dynamic = 'force-dynamic'

export default async function CoveragePage({
  params,
}: {
  readonly params: Promise<{ readonly id: string }>
}) {
  const { id } = await params
  const [diagnostics, detail] = await Promise.all([getCoverage(id), getSchedule(id)])

  const status = rosterStatus(detail.schedule, detail.latestRun)

  return (
    <div className="space-y-6">
      <RosterFreshness scheduleId={id} status={status} />
      <CoverageView
        diagnostics={diagnostics}
        staff={detail.staff}
        shifts={detail.shifts}
        roles={detail.roles}
      />
    </div>
  )
}
