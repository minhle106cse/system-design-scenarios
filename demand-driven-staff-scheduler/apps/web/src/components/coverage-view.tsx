import type { Diagnostics, StaffMember, Shift, Role } from '@/lib/api-client'
import { buildCoverageGrid, demandGridKey } from '@/lib/grid'
import { coverageTone } from '@/lib/tone'
import { DAYS_OF_WEEK, dayLabel } from '@/lib/week'
import { formatHours, formatPercent } from '@/lib/format'
import { Badge } from '@/components/ui/badge'
import { Banner } from '@/components/ui/banner'
import { RoleDiagnosticsBanners } from '@/components/role-diagnostics-banners'

/**
 * §8 stretch — required vs scheduled per hour, recomputed live from the current roster on every
 * load (`docs/04_data_model.md`'s dated note: a stored snapshot would go stale after a manual
 * edit). `frontend_standard.md` §1 rule 1: staff hours are labelled "Hours booked vs contracted",
 * never "utilisation" — the internal ratio is still what drives the badge color.
 *
 * The grid and the per-staff table sit side by side from `xl` up: they answer the same question
 * from two directions (is the WEEK covered / is each PERSON fairly loaded), and stacking them
 * meant the second one was always below the fold.
 */
export function CoverageView({
  diagnostics,
  staff,
  shifts,
  roles,
}: {
  readonly diagnostics: Diagnostics
  readonly staff: readonly StaffMember[]
  readonly shifts: readonly Shift[]
  readonly roles: readonly Role[]
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

      <RoleDiagnosticsBanners diagnostics={diagnostics} roles={roles} shifts={shifts} />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div>
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-sm font-semibold text-slate-700">Coverage by hour</h2>
            <div className="flex shrink-0 gap-1.5">
              <Badge tone="bad">Understaffed</Badge>
              <Badge tone="good">OK</Badge>
              <Badge tone="warn">Overstaffed</Badge>
            </div>
          </div>
          <p className="text-xs text-slate-500">
            Each cell reads <strong>scheduled / required</strong> — the staff booked for that hour
            over the number the demand calls for.
          </p>
          {hours.length === 0 ? (
            <p className="mt-2 rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
              No coverage data yet — run auto-schedule on the Roster tab first.
            </p>
          ) : (
            <div className="mt-2 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-card">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/80">
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Hour
                    </th>
                    {DAYS_OF_WEEK.map((d) => (
                      <th
                        key={d}
                        className="px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide text-slate-500"
                      >
                        {dayLabel(d)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {hours.map((hour) => (
                    <tr key={hour}>
                      <td className="whitespace-nowrap px-3 py-1.5 text-xs font-medium text-slate-500">
                        {hour}:00
                      </td>
                      {DAYS_OF_WEEK.map((d) => {
                        const cell = grid.get(demandGridKey(d, hour))
                        return (
                          <td
                            key={d}
                            className={`px-3 py-1.5 text-center font-medium tabular-nums ${
                              cell ? coverageTone(cell.status) : 'text-slate-300'
                            }`}
                          >
                            {cell ? `${cell.scheduled}/${cell.required}` : '—'}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div>
          <h2 className="text-sm font-semibold text-slate-700">Hours booked vs contracted</h2>
          <p className="text-xs text-slate-500">Against each person&apos;s own weekly maximum.</p>
          <div className="mt-2 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-card">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50/80">
                <tr>
                  <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Staff
                  </th>
                  <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Booked
                  </th>
                  <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Of max
                  </th>
                </tr>
              </thead>
              <tbody>
                {diagnostics.staff.map((s) => (
                  <tr key={s.staffId} className="border-b border-slate-100 last:border-0">
                    <td className="px-3 py-1.5">
                      <span className="text-slate-900">
                        {staffById.get(s.staffId)?.name ?? s.staffId}
                      </span>
                      {s.belowTarget && (
                        <span className="ml-1.5 align-middle">
                          <Badge tone="warn">below target</Badge>
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums text-slate-600">
                      {formatHours(s.assignedHours)} / {formatHours(s.maxWeeklyHours)}
                    </td>
                    <td className="px-3 py-1.5 text-right font-medium tabular-nums text-slate-900">
                      {formatPercent(s.utilisation)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
