'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const TABS: readonly { readonly href: string; readonly label: string }[] = [
  { href: 'roles', label: 'Roles' },
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
    <nav className="flex gap-1 rounded-lg bg-slate-100/80 p-1">
      {TABS.map((tab) => {
        const href = `/s/${scheduleId}/${tab.href}`
        const active = pathname === href
        return (
          <Link
            key={tab.href}
            href={href}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              active
                ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-900/5'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
