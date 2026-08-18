'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const TABS: readonly { readonly href: string; readonly label: string }[] = [
  { href: 'staff', label: 'Staff' },
  { href: 'demand', label: 'Demand' },
  { href: 'shifts', label: 'Shifts' },
  { href: 'roster', label: 'Roster' },
  { href: 'summary', label: 'Summary' },
  { href: 'coverage', label: 'Coverage' },
]

/** Tab nav shared by every `/s/[id]/*` screen — `docs/05_ui_guidelines.md`'s seven-screen list. */
export function ScheduleTabs({ scheduleId }: { readonly scheduleId: string }) {
  const pathname = usePathname()

  return (
    <nav className="flex gap-1 border-b border-slate-200">
      {TABS.map((tab) => {
        const href = `/s/${scheduleId}/${tab.href}`
        const active = pathname === href
        return (
          <Link
            key={tab.href}
            href={href}
            className={`rounded-t-md px-3 py-2 text-sm font-medium ${
              active
                ? 'border-b-2 border-slate-900 text-slate-900'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
