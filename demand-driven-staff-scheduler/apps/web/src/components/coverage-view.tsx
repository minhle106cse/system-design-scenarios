import type { Diagnostics, StaffMember } from '@/lib/api-client'
import { buildCoverageGrid, demandGridKey } from '@/lib/grid'
import { coverageTone } from '@/lib/tone'
import { DAYS_OF_WEEK, dayLabel } from '@/lib/week'
import { formatHours, formatPercent } from '@/lib/format'
import { Badge } from '@/components/ui/badge'
import { Banner } from '@/components/ui/banner'

/**
 * §8 stretch — required vs scheduled per hour, recomputed live from the current roster on every
 * load (`docs/04_data_model.md`'s dated note: a stored snapshot would go stale after a manual
 * edit). `frontend_standard.md` §1 rule 1: staff hours are labelled "Hours booked vs contracted",
 * never "utilisation" — the internal ratio is still what drives the badge color.
 */
export function CoverageView({
  diagnostics,
  staff,
}: {
  readonly diagnostics: Diagnostics
  readonly staff: readonly StaffMember[]
}) {
  const staffById = new Map(staff.map((s) => [s.id, s]))
  const hours = Array.from(new Set(diagnostics.hours.map((h) => h.hour))).sort((a, b) => a - b)
  const grid = buildCoverageGrid(diagnostics.hours)
  const { floorStaffHours, contractedStaffHours } = diagnostics.structural

  return (
    <div className="space-y-6">
      {floorStaffHours > contractedStaffHours && (
        <Banner tone="warning">
          The busiest realistic staffing level needs about {formatHours(floorStaffHours)} of work
          this week, but the team is only contracted for {formatHours(contractedStaffHours)}. Demand
          exceeds what the current staff can cover — consider adding staff or hours.
        </Banner>
      )}

      {diagnostics.unfilledSeats.length > 0 && (
        <Banner tone="warning">
          {diagnostics.unfilledSeats.length} shift-day seat(s) couldn&apos;t be filled by
          auto-schedule. Check the Roster tab for details.
        </Banner>
      )}

      <div>
        <h2 className="text-sm font-medium text-slate-700">Coverage by hour</h2>
        <p className="text-xs text-slate-500">Required staff vs. scheduled staff, per hour.</p>
        {hours.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">
            No coverage data yet — run auto-schedule on the Roster tab first.
          </p>
        ) : (
          <div className="mt-2 overflow-x-auto">
            <table className="border-collapse text-xs">
              <thead>
                <tr>
                  <th className="p-1 text-left text-slate-500">Hour</th>
                  {DAYS_OF_WEEK.map((d) => (
                    <th key={d} className="p-1 text-center text-slate-500">
                      {dayLabel(d)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {hours.map((hour) => (
                  <tr key={hour}>
                    <td className="p-1 text-slate-500">{hour}:00</td>
                    {DAYS_OF_WEEK.map((d) => {
                      const cell = grid.get(demandGridKey(d, hour))
                      return (
                        <td
                          key={d}
                          className={`border p-1 text-center ${cell ? coverageTone(cell.status) : ''}`}
                        >
                          {cell ? `${cell.scheduled}/${cell.required}` : '—'}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-2 flex gap-3 text-xs text-slate-600">
              <span>
                <Badge tone="bad">Understaffed</Badge>
              </span>
              <span>
                <Badge tone="good">OK</Badge>
              </span>
              <span>
                <Badge tone="warn">Overstaffed</Badge>
              </span>
            </div>
          </div>
        )}
      </div>

      <div>
        <h2 className="text-sm font-medium text-slate-700">Hours booked vs contracted</h2>
        <div className="mt-2 overflow-x-auto rounded-md border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <th className="px-3 py-2 font-medium text-slate-600">Staff</th>
                <th className="px-3 py-2 font-medium text-slate-600">Booked</th>
                <th className="px-3 py-2 font-medium text-slate-600">Contracted</th>
                <th className="px-3 py-2 font-medium text-slate-600">Booked / contracted</th>
                <th className="px-3 py-2 font-medium text-slate-600"></th>
              </tr>
            </thead>
            <tbody>
              {diagnostics.staff.map((s) => (
                <tr key={s.staffId} className="border-b border-slate-100 last:border-0">
                  <td className="px-3 py-1.5">{staffById.get(s.staffId)?.name ?? s.staffId}</td>
                  <td className="px-3 py-1.5">{formatHours(s.assignedHours)}</td>
                  <td className="px-3 py-1.5">{formatHours(s.maxWeeklyHours)}</td>
                  <td className="px-3 py-1.5">{formatPercent(s.utilisation)}</td>
                  <td className="px-3 py-1.5">
                    {s.belowTarget && <Badge tone="warn">Below fair-share target</Badge>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
