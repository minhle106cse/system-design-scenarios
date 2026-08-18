// Auto-schedule + manual roster editing — brief §2.5, the heart of the exercise.
import { getSchedule, getSuggestedN } from '@/lib/api-client'
import { RosterManager } from '@/components/roster-manager'

export const dynamic = 'force-dynamic'

export default async function RosterPage({
  params,
}: {
  readonly params: Promise<{ readonly id: string }>
}) {
  const { id } = await params
  const [detail, suggestedN] = await Promise.all([getSchedule(id), getSuggestedN(id)])

  return (
    <RosterManager
      scheduleId={id}
      schedule={detail.schedule}
      staff={detail.staff}
      shifts={detail.shifts}
      assignments={detail.assignments}
      latestRun={detail.latestRun}
      suggestedN={suggestedN}
      roles={detail.roles}
    />
  )
}
