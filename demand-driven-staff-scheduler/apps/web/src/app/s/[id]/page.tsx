import { redirect } from 'next/navigation'

export default async function ScheduleIndexPage({
  params,
}: {
  readonly params: Promise<{ readonly id: string }>
}) {
  const { id } = await params
  redirect(`/s/${id}/staff`)
}
