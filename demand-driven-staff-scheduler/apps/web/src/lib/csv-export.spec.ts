import { describe, expect, it } from 'vitest'
import { toRosterCsv, toSummaryCsv } from './csv-export'

const staff = [{ id: 's1', scheduleId: 'sched', name: 'Alice Nguyen', maxWeeklyHours: 40 }]
const shifts = [
  {
    id: 'sh1',
    scheduleId: 'sched',
    label: 'Morning',
    startMinute: 420,
    endMinute: 900,
  },
]

describe('csv-export', () => {
  it('renders roster rows with day/shift/time/staff/source', () => {
    const csv = toRosterCsv(
      [
        {
          id: 'a1',
          scheduleId: 'sched',
          staffId: 's1',
          shiftId: 'sh1',
          dayOfWeek: 1,
          source: 'AUTO',
        },
      ],
      staff,
      shifts,
    )
    const lines = csv.split('\r\n')
    expect(lines[0]).toBe('Day,Shift,Start,End,Staff,Source')
    expect(lines[1]).toBe('Mon,Morning,07:00,15:00,Alice Nguyen,AUTO')
  })

  it('quotes a name containing a comma', () => {
    const csv = toRosterCsv(
      [
        {
          id: 'a1',
          scheduleId: 'sched',
          staffId: 's1',
          shiftId: 'sh1',
          dayOfWeek: 1,
          source: 'AUTO',
        },
      ],
      [
        {
          id: 's1',
          scheduleId: 'sched',
          name: 'Nguyen, Alice',
          maxWeeklyHours: 40,
        },
      ],
      shifts,
    )
    expect(csv).toContain('"Nguyen, Alice"')
  })

  it('renders summary cells with a blank for a null transactions-per-staff-hour ratio', () => {
    const csv = toSummaryCsv({
      cells: [
        {
          day: 2,
          hour: 9,
          transactions: 5,
          staffHours: 0,
          transactionsPerStaffHour: null,
        },
      ],
      totalStaffHours: 10,
      totalTransactions: 100,
      transactionsPerStaffHourOverall: 10,
      averageTransactionsPerStaffHour: 12,
    })
    expect(csv).toContain('Tue,9,5,0,')
    expect(csv).toContain('Total staff hours,10')
  })
})
