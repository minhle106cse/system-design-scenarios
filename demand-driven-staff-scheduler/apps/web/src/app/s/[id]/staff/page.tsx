// Staff CRUD — brief §2.2: name + max weekly hours, add/edit/remove.
import { getSchedule } from '@/lib/api-client'
import { StaffManager } from '@/components/staff-manager'

export const dynamic = 'force-dynamic'

export default async function StaffPage({
  params,
}: {
  readonly params: Promise<{ readonly id: string }>
}) {
  const { id } = await params
  const detail = await getSchedule(id)

  return (
    <StaffManager
      scheduleId={id}
      staff={detail.staff}
      unavailability={detail.unavailability}
      roles={detail.roles}
      staffRoles={detail.staffRoles}
    />
  )
}
