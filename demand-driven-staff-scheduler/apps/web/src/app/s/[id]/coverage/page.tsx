// Coverage view — brief §8 stretch: required vs scheduled per hour, live from the persisted roster.
import { getCoverage, getSchedule } from '@/lib/api-client'
import { CoverageView } from '@/components/coverage-view'

export const dynamic = 'force-dynamic'

export default async function CoveragePage({
  params,
}: {
  readonly params: Promise<{ readonly id: string }>
}) {
  const { id } = await params
  const [diagnostics, detail] = await Promise.all([getCoverage(id), getSchedule(id)])

  return (
    <CoverageView
      diagnostics={diagnostics}
      staff={detail.staff}
      shifts={detail.shifts}
      roles={detail.roles}
    />
  )
}
