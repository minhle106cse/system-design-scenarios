// Schedules list + create — brief §2.1, the only route above a schedule.
import Link from 'next/link'
import { listSchedules } from '@/lib/api-client'
import { CreateScheduleForm } from '@/components/create-schedule-form'
import { DataTable } from '@/components/ui/data-table'

export const dynamic = 'force-dynamic'

export default async function HomePage() {
  const schedules = await listSchedules()

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-2xl font-semibold">Demand-Driven Staff Scheduler</h1>
      <p className="mt-2 text-slate-600">
        Plan weekly staff schedules from historical transaction demand.
      </p>

      <section className="mt-8">
        <h2 className="text-sm font-medium text-slate-700">Schedules</h2>
        <div className="mt-2">
          <DataTable
            columns={[
              {
                header: 'Name',
                render: (s) => (
                  <Link
                    href={`/s/${s.id}/staff`}
                    className="font-medium text-slate-900 hover:underline"
                  >
                    {s.name}
                  </Link>
                ),
              },
              {
                header: 'Created',
                render: (s) => new Date(s.createdAt).toLocaleDateString(),
              },
              {
                header: '',
                render: (s) => (
                  <Link href={`/s/${s.id}/staff`} className="text-slate-500 hover:text-slate-900">
                    Open →
                  </Link>
                ),
              },
            ]}
            rows={schedules}
            rowKey={(s) => s.id}
            emptyMessage="No schedules yet — create your first one below."
          />
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-medium text-slate-700">New schedule</h2>
        <CreateScheduleForm />
      </section>
    </main>
  )
}
