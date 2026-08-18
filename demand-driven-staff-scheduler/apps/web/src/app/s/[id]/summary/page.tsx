// Aggregated summary — brief §2.6: per (day, hour) transactions/staff-hours/ratio + week totals.
import { getSummary } from '@/lib/api-client'
import { SummaryView } from '@/components/summary-view'

export const dynamic = 'force-dynamic'

export default async function SummaryPage({
  params,
}: {
  readonly params: Promise<{ readonly id: string }>
}) {
  const { id } = await params
  const report = await getSummary(id)

  return <SummaryView report={report} />
}
