// Demand import — brief §2.3: upload the transaction CSV, review the import result, see the heatmap.
import { getSchedule } from '@/lib/api-client'
import { DemandManager } from '@/components/demand-manager'

export const dynamic = 'force-dynamic'

export default async function DemandPage({
  params,
}: {
  readonly params: Promise<{ readonly id: string }>
}) {
  const { id } = await params
  const detail = await getSchedule(id)

  return <DemandManager scheduleId={id} demandCells={detail.demandCells} />
}
