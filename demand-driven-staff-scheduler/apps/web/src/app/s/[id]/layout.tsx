import type { ReactNode } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getSchedule, ApiError } from '@/lib/api-client'
import { ScheduleTabs } from '@/components/nav/schedule-tabs'

export const dynamic = 'force-dynamic'

/**
 * Shared header + tab nav for every `/s/[id]/*` screen. `getSchedule` here and in each page below
 * hit the identical URL — Next's per-request fetch memoization collapses them to one real network
 * call (`frontend_standard.md` §2: data fetching happens in the page/layout server component, not
 * a client-side effect).
 */
export default async function ScheduleLayout({
  children,
  params,
}: {
  readonly children: ReactNode
  readonly params: Promise<{ readonly id: string }>
}) {
  const { id } = await params

  let scheduleName: string
  try {
    const detail = await getSchedule(id)
    scheduleName = detail.schedule.name
  } catch (err) {
    if (err instanceof ApiError && err.statusCode === 404) notFound()
    throw err
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <div className="mb-6">
        <Link
          href="/"
          className="text-xs font-medium text-slate-500 transition-colors hover:text-accent-700"
        >
          ← All schedules
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
          {scheduleName}
        </h1>
      </div>
      <ScheduleTabs scheduleId={id} />
      <div className="mt-6">{children}</div>
    </main>
  )
}
