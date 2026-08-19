'use client'

import type { SummaryReport } from '@/lib/api-client'
import { toSummaryCsv } from '@/lib/csv-export'
import { DAYS_OF_WEEK, dayLabel } from '@/lib/week'
import { formatHours, formatRatio } from '@/lib/format'
import { Button } from '@/components/ui/button'

function downloadCsv(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * §2.6 — the aggregated summary. `frontend_standard.md` §1 rule 2 is enforced here: the two
 * week-level "transactions per staff hour" figures each get their own caption explaining what
 * they mean and why they can differ — never shown side by side unexplained.
 *
 * Laid out as a day×hour GRID with the three values stacked per cell, not the 112-row list it
 * used to be: the brief explicitly allows this ("a single grid, stacked values per cell, or
 * separate grids per metric are all fine") and the list forced a manager to scroll a full screen
 * to compare two hours of the same day. The full per-row detail is still one click away in the
 * CSV export.
 */
export function SummaryView({ report }: { readonly report: SummaryReport }) {
  const byKey = new Map(report.cells.map((c) => [`${c.day}:${c.hour}`, c]))
  const hours = Array.from(new Set(report.cells.map((c) => c.hour))).sort((a, b) => a - b)

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-card">
          <p className="text-xs text-slate-500">Total staff hours</p>
          <p className="text-xl font-semibold tabular-nums text-slate-900">
            {formatHours(report.totalStaffHours)}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-card">
          <p className="text-xs text-slate-500">Total transactions</p>
          <p className="text-xl font-semibold tabular-nums text-slate-900">
            {report.totalTransactions}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-card">
          <p className="text-xs text-slate-500">Transactions per staff hour (overall)</p>
          <p className="text-xl font-semibold tabular-nums text-slate-900">
            {formatRatio(report.transactionsPerStaffHourOverall)}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Total transactions ÷ total staff hours — weighted by how many hours were actually
            worked.
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-card">
          <p className="text-xs text-slate-500">Average transactions per staff hour</p>
          <p className="text-xl font-semibold tabular-nums text-slate-900">
            {formatRatio(report.averageTransactionsPerStaffHour)}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            The plain average of each hour&apos;s own ratio — every staffed hour counts equally, so
            it can read higher or lower than the overall figure if busy and quiet hours were staffed
            differently.
          </p>
        </div>
      </div>

      <div>
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-700">By day and hour</h2>
            <p className="text-xs text-slate-500">
              Each cell stacks <strong>transactions</strong> · <strong>staff hours</strong> ·{' '}
              <strong>transactions per staff hour</strong>. A dash means no staff were scheduled
              that hour.
            </p>
          </div>
          <Button
            variant="secondary"
            onClick={() => downloadCsv('summary.csv', toSummaryCsv(report))}
          >
            Export CSV
          </Button>
        </div>

        {report.cells.length === 0 ? (
          <p className="mt-2 rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
            No demand data yet — import a CSV on the Demand tab.
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
                  <tr key={hour} className="border-b border-slate-100 last:border-0">
                    <td className="whitespace-nowrap px-3 py-1.5 text-xs font-medium text-slate-500">
                      {hour}:00
                    </td>
                    {DAYS_OF_WEEK.map((d) => {
                      const cell = byKey.get(`${d}:${hour}`)
                      if (!cell) {
                        return (
                          <td key={d} className="px-3 py-1.5 text-center text-slate-300">
                            —
                          </td>
                        )
                      }
                      return (
                        <td key={d} className="px-3 py-1.5 text-center tabular-nums">
                          <span className="font-medium text-slate-900">{cell.transactions}</span>
                          <span className="text-slate-300"> · </span>
                          <span className="text-slate-500">{cell.staffHours}h</span>
                          <span className="text-slate-300"> · </span>
                          <span
                            className={
                              cell.transactionsPerStaffHour === null
                                ? 'text-slate-300'
                                : 'font-medium text-accent-700'
                            }
                          >
                            {formatRatio(cell.transactionsPerStaffHour)}
                          </span>
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
    </div>
  )
}
