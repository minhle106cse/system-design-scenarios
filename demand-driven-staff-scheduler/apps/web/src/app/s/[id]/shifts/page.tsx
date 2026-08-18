// Shift CRUD — brief §2.4: start + end time only, seeded 07:00-15:00 / 15:00-23:00.
import { getSchedule } from '@/lib/api-client'
import { ShiftManager } from '@/components/shift-manager'

export const dynamic = 'force-dynamic'

export default async function ShiftsPage({
  params,
}: {
  readonly params: Promise<{ readonly id: string }>
}) {
  const { id } = await params
  const detail = await getSchedule(id)

  return <ShiftManager scheduleId={id} shifts={detail.shifts} />
}
