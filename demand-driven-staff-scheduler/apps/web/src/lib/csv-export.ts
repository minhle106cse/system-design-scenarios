/** Plain-string CSV builders for the export buttons (brief §8 stretch: "export the roster"). No
 *  library — this repo's own demand importer already proves a real parser matters more than a
 *  generator does, and a generator is the easy direction (no quoted-comma ambiguity to resolve). */
import type { Assignment, Shift, StaffMember, SummaryReport } from './api-client'
import { dayLabel, formatMinutes } from './week'

function escapeCsvCell(value: string | number): string {
  const s = String(value)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function toCsv(rows: readonly (readonly (string | number)[])[]): string {
  return rows.map((row) => row.map(escapeCsvCell).join(',')).join('\r\n')
}

export function toRosterCsv(
  assignments: readonly Assignment[],
  staff: readonly StaffMember[],
  shifts: readonly Shift[],
): string {
  const staffById = new Map(staff.map((s) => [s.id, s]))
  const shiftById = new Map(shifts.map((s) => [s.id, s]))

  const rows: (string | number)[][] = [['Day', 'Shift', 'Start', 'End', 'Staff', 'Source']]
  for (const a of assignments) {
    const shift = shiftById.get(a.shiftId)
    rows.push([
      dayLabel(a.dayOfWeek),
      shift?.label ?? a.shiftId,
      shift ? formatMinutes(shift.startMinute) : '',
      shift ? formatMinutes(shift.endMinute) : '',
      staffById.get(a.staffId)?.name ?? a.staffId,
      a.source,
    ])
  }
  return toCsv(rows)
}

export function toSummaryCsv(report: SummaryReport): string {
  const rows: (string | number)[][] = [
    ['Day', 'Hour', 'Transactions', 'Staff hours', 'Transactions per staff hour'],
  ]
  for (const cell of report.cells) {
    rows.push([
      dayLabel(cell.day),
      cell.hour,
      cell.transactions,
      cell.staffHours,
      cell.transactionsPerStaffHour ?? '',
    ])
  }
  rows.push([])
  rows.push(['Total staff hours', report.totalStaffHours])
  rows.push(['Total transactions', report.totalTransactions])
  rows.push(['Transactions per staff hour (overall)', report.transactionsPerStaffHourOverall ?? ''])
  rows.push(['Average transactions per staff hour', report.averageTransactionsPerStaffHour ?? ''])
  return toCsv(rows)
}
