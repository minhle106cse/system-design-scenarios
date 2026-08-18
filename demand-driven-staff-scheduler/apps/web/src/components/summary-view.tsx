'use client'

import type { SummaryReport } from '@/lib/api-client'
import { toSummaryCsv } from '@/lib/csv-export'
import { dayLabel } from '@/lib/week'
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
 */
export function SummaryView({ report }: { readonly report: SummaryReport }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-md border border-slate-200 bg-white p-3">
          <p className="text-xs text-slate-500">Total staff hours</p>
          <p className="text-lg font-semibold text-slate-900">
            {formatHours(report.totalStaffHours)}
          </p>
        </div>
        <div className="rounded-md border border-slate-200 bg-white p-3">
          <p className="text-xs text-slate-500">Total transactions</p>
          <p className="text-lg font-semibold text-slate-900">{report.totalTransactions}</p>
        </div>
        <div className="rounded-md border border-slate-200 bg-white p-3">
          <p className="text-xs text-slate-500">Transactions per staff hour (overall)</p>
          <p className="text-lg font-semibold text-slate-900">
            {formatRatio(report.transactionsPerStaffHourOverall)}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Total transactions ÷ total staff hours — weighted by how many hours were actually
            worked.
          </p>
        </div>
        <div className="rounded-md border border-slate-200 bg-white p-3">
          <p className="text-xs text-slate-500">Average transactions per staff hour</p>
          <p className="text-lg font-semibold text-slate-900">
            {formatRatio(report.averageTransactionsPerStaffHour)}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            The plain average of each hour&apos;s own ratio — every staffed hour counts equally, so
            it can read higher or lower than the overall figure if busy and quiet hours were staffed
            differently.
          </p>
        </div>
      </div>

      <div className="flex justify-end">
        <Button
          variant="secondary"
          onClick={() => downloadCsv('summary.csv', toSummaryCsv(report))}
        >
          Export CSV
        </Button>
      </div>

      <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50">
            <tr>
              <th className="px-3 py-2 font-medium text-slate-600">Day</th>
              <th className="px-3 py-2 font-medium text-slate-600">Hour</th>
              <th className="px-3 py-2 font-medium text-slate-600">Transactions</th>
              <th className="px-3 py-2 font-medium text-slate-600">Staff hours</th>
              <th className="px-3 py-2 font-medium text-slate-600">Transactions / staff hour</th>
            </tr>
          </thead>
          <tbody>
            {report.cells.map((cell) => (
              <tr
                key={`${cell.day}:${cell.hour}`}
                className="border-b border-slate-100 last:border-0"
              >
                <td className="px-3 py-1.5">{dayLabel(cell.day)}</td>
                <td className="px-3 py-1.5">{cell.hour}:00</td>
                <td className="px-3 py-1.5">{cell.transactions}</td>
                <td className="px-3 py-1.5">{cell.staffHours}</td>
                <td className="px-3 py-1.5">{formatRatio(cell.transactionsPerStaffHour)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {report.cells.length === 0 && (
          <p className="p-6 text-center text-sm text-slate-500">
            No demand data yet — import a CSV on the Demand tab.
          </p>
        )}
      </div>
    </div>
  )
}
