// Roles/skills — brief §8 stretch: define the roles a shift can require.
import { getSchedule } from '@/lib/api-client'
import { RolesManager } from '@/components/roles-manager'

export const dynamic = 'force-dynamic'

export default async function RolesPage({
  params,
}: {
  readonly params: Promise<{ readonly id: string }>
}) {
  const { id } = await params
  const detail = await getSchedule(id)

  return <RolesManager scheduleId={id} roles={detail.roles} staffRoles={detail.staffRoles} />
}
