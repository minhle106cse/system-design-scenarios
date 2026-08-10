import {
  businessDayBounds,
  checkBusinessHours,
  enumerateCandidateWindows,
  filterFutureWindows,
  isBusinessDay,
  isoWeekdayOf,
  zonedDateOf,
  zonedTimeToUtc,
  type BusinessHours,
} from './business-hours'

// 2026-08-17 is a MONDAY. Every fixture date in the booking specs is a weekday
// on purpose: BUSINESS_DAYS defaults to Mon–Fri, so a weekend date would make
// the whole grid legitimately empty and the assertion would be testing the
// wrong thing. (The repo's own cURL example used to book a Saturday.)
const MONDAY = '2026-08-17'
const SATURDAY = '2026-08-15'

const utcHours: BusinessHours = {
  start: '08:00',
  end: '18:00',
  timeZone: 'UTC',
  slotGranularityMinutes: 30,
  days: [1, 2, 3, 4, 5],
  closedDates: [],
}

// Europe/London is deliberately chosen over a fixed-offset zone: it is UTC in
// winter and UTC+1 in summer, so the same config produces different instants on
// different dates. A fixed-offset zone would let broken offset arithmetic pass.
const londonHours: BusinessHours = { ...utcHours, timeZone: 'Europe/London' }

// Far enough in the past/future that these tests never depend on the wall clock.
const LONG_AGO = new Date('2000-01-01T00:00:00.000Z')

describe('zonedTimeToUtc', () => {
  it('treats the time as UTC when the zone is UTC', () => {
    expect(zonedTimeToUtc(MONDAY, '08:00', 'UTC').toISOString()).toBe('2026-08-17T08:00:00.000Z')
  })

  it('applies the summer offset (BST, UTC+1)', () => {
    expect(zonedTimeToUtc(MONDAY, '08:00', 'Europe/London').toISOString()).toBe(
      '2026-08-17T07:00:00.000Z',
    )
  })

  it('applies the winter offset (GMT, UTC+0) for the same configured time', () => {
    // Same '08:00' in the same zone, four months later — a different instant.
    // This is the case a hardcoded offset gets wrong.
    expect(zonedTimeToUtc('2026-12-15', '08:00', 'Europe/London').toISOString()).toBe(
      '2026-12-15T08:00:00.000Z',
    )
  })

  it('is correct on the day the clocks go forward', () => {
    // 2026-03-29: BST begins at 01:00 UTC. 08:00 local is already BST.
    expect(zonedTimeToUtc('2026-03-29', '08:00', 'Europe/London').toISOString()).toBe(
      '2026-03-29T07:00:00.000Z',
    )
  })

  it('is correct on the day the clocks go back', () => {
    // 2026-10-25: BST ends at 01:00 UTC. 08:00 local is already GMT.
    expect(zonedTimeToUtc('2026-10-25', '08:00', 'Europe/London').toISOString()).toBe(
      '2026-10-25T08:00:00.000Z',
    )
  })

  it('handles a zone behind UTC', () => {
    // 2026-08-17 is EDT (UTC-4).
    expect(zonedTimeToUtc(MONDAY, '08:00', 'America/New_York').toISOString()).toBe(
      '2026-08-17T12:00:00.000Z',
    )
  })
})

describe('zonedDateOf', () => {
  it('reports the local calendar day, not the UTC one', () => {
    // 03:00 UTC is still the previous evening in New York.
    expect(zonedDateOf(new Date('2026-08-17T03:00:00.000Z'), 'America/New_York')).toBe('2026-08-16')
  })
})

describe('isoWeekdayOf', () => {
  it('numbers Monday as 1 and Sunday as 7 (ISO-8601, not JS getDay)', () => {
    expect(isoWeekdayOf('2026-08-17')).toBe(1) // Monday
    expect(isoWeekdayOf('2026-08-15')).toBe(6) // Saturday
    expect(isoWeekdayOf('2026-08-16')).toBe(7) // Sunday — JS getDay() would say 0
  })
})

describe('isBusinessDay', () => {
  it('accepts a configured weekday', () => {
    expect(isBusinessDay(MONDAY, utcHours)).toBe(true)
  })

  it('rejects a weekday not in the configured set', () => {
    expect(isBusinessDay(SATURDAY, utcHours)).toBe(false)
  })

  it('rejects an explicitly closed date even on a normal working day', () => {
    const withHoliday: BusinessHours = { ...utcHours, closedDates: [MONDAY] }

    expect(isBusinessDay(MONDAY, withHoliday)).toBe(false)
  })

  it('honours a configuration that opens at the weekend', () => {
    const alwaysOpen: BusinessHours = { ...utcHours, days: [1, 2, 3, 4, 5, 6, 7] }

    expect(isBusinessDay(SATURDAY, alwaysOpen)).toBe(true)
  })
})

describe('businessDayBounds', () => {
  it('brackets the configured local day', () => {
    const { startAt, endAt } = businessDayBounds(MONDAY, londonHours)

    expect(startAt.toISOString()).toBe('2026-08-17T07:00:00.000Z')
    expect(endAt.toISOString()).toBe('2026-08-17T17:00:00.000Z')
  })
})

describe('enumerateCandidateWindows', () => {
  it('steps by the granularity and stops when the duration no longer fits', () => {
    const windows = enumerateCandidateWindows(MONDAY, utcHours, 30)

    // 08:00 → 17:30 inclusive, every 30 minutes.
    expect(windows).toHaveLength(20)
    expect(windows[0].startAt.toISOString()).toBe('2026-08-17T08:00:00.000Z')
    expect(windows[1].startAt.toISOString()).toBe('2026-08-17T08:30:00.000Z')
    expect(windows[19].startAt.toISOString()).toBe('2026-08-17T17:30:00.000Z')
    expect(windows[19].endAt.toISOString()).toBe('2026-08-17T18:00:00.000Z')
  })

  it('gives a longer service fewer starting points, without rounding its duration', () => {
    const windows = enumerateCandidateWindows(MONDAY, utcHours, 90)

    // Last 90-minute service must START by 16:30 to end at 18:00.
    expect(windows).toHaveLength(18)
    expect(windows[17].startAt.toISOString()).toBe('2026-08-17T16:30:00.000Z')
    expect(windows[17].endAt.toISOString()).toBe('2026-08-17T18:00:00.000Z')
  })

  it('offers a start on the grid even when the duration is not a multiple of it', () => {
    const windows = enumerateCandidateWindows(MONDAY, utcHours, 45)

    // The grid governs starts, never durations — a 45-minute job on a
    // 30-minute grid is legal and finishes off-grid.
    expect(windows[0].endAt.toISOString()).toBe('2026-08-17T08:45:00.000Z')
  })

  it('returns nothing on a day the dealership is closed', () => {
    expect(enumerateCandidateWindows(SATURDAY, utcHours, 30)).toEqual([])
  })

  it('returns nothing on an explicitly closed date', () => {
    expect(enumerateCandidateWindows(MONDAY, { ...utcHours, closedDates: [MONDAY] }, 30)).toEqual(
      [],
    )
  })

  it('returns nothing when the service cannot fit in the day at all', () => {
    expect(enumerateCandidateWindows(MONDAY, utcHours, 11 * 60)).toEqual([])
  })

  it('returns nothing rather than looping forever on a non-positive granularity', () => {
    expect(
      enumerateCandidateWindows(MONDAY, { ...utcHours, slotGranularityMinutes: 0 }, 30),
    ).toEqual([])
  })

  it('returns nothing for a non-positive duration', () => {
    expect(enumerateCandidateWindows(MONDAY, utcHours, 0)).toEqual([])
  })
})

describe('filterFutureWindows', () => {
  const windows = [
    { startAt: new Date('2026-08-17T08:00:00.000Z'), endAt: new Date('2026-08-17T08:30:00.000Z') },
    { startAt: new Date('2026-08-17T12:00:00.000Z'), endAt: new Date('2026-08-17T12:30:00.000Z') },
  ]

  it('keeps everything when the whole day is still ahead', () => {
    expect(filterFutureWindows(windows, LONG_AGO)).toHaveLength(2)
  })

  it('drops slots that have already started', () => {
    const midMorning = new Date('2026-08-17T09:00:00.000Z')

    const kept = filterFutureWindows(windows, midMorning)

    expect(kept).toHaveLength(1)
    expect(kept[0].startAt.toISOString()).toBe('2026-08-17T12:00:00.000Z')
  })

  it('drops a slot that starts exactly now — "now" is already too late to book', () => {
    expect(filterFutureWindows(windows, new Date('2026-08-17T08:00:00.000Z'))).toHaveLength(1)
  })

  it('drops everything for a date entirely in the past', () => {
    expect(filterFutureWindows(windows, new Date('2030-01-01T00:00:00.000Z'))).toEqual([])
  })
})

describe('checkBusinessHours', () => {
  const window = (startAt: string, endAt: string) => ({
    startAt: new Date(startAt),
    endAt: new Date(endAt),
  })

  it('accepts a window inside the configured day', () => {
    expect(
      checkBusinessHours(window('2026-08-17T10:00:00.000Z', '2026-08-17T10:30:00.000Z'), utcHours),
    ).toBeNull()
  })

  it('accepts a start that is not on the granularity grid', () => {
    // The grid is a browsing aid; refusing 08:05 would reject usable capacity.
    expect(
      checkBusinessHours(window('2026-08-17T08:05:00.000Z', '2026-08-17T08:35:00.000Z'), utcHours),
    ).toBeNull()
  })

  it('accepts a window ending exactly at closing time', () => {
    expect(
      checkBusinessHours(window('2026-08-17T17:30:00.000Z', '2026-08-17T18:00:00.000Z'), utcHours),
    ).toBeNull()
  })

  it('reports outside_hours for a window starting before opening time', () => {
    expect(
      checkBusinessHours(window('2026-08-17T03:00:00.000Z', '2026-08-17T03:30:00.000Z'), utcHours),
    ).toBe('outside_hours')
  })

  it('reports outside_hours for a window that runs past closing time', () => {
    expect(
      checkBusinessHours(window('2026-08-17T17:45:00.000Z', '2026-08-17T18:15:00.000Z'), utcHours),
    ).toBe('outside_hours')
  })

  it('reports closed_day for a weekend, even at a time that would otherwise be fine', () => {
    // The distinction matters to the caller: "pick another date", not
    // "pick another time on this date".
    expect(
      checkBusinessHours(window('2026-08-15T10:00:00.000Z', '2026-08-15T10:30:00.000Z'), utcHours),
    ).toBe('closed_day')
  })

  it('reports closed_day for an explicitly closed date', () => {
    expect(
      checkBusinessHours(window('2026-08-17T10:00:00.000Z', '2026-08-17T10:30:00.000Z'), {
        ...utcHours,
        closedDates: [MONDAY],
      }),
    ).toBe('closed_day')
  })

  it('evaluates against the local day, not the UTC day', () => {
    // 07:30 UTC is 08:30 local in London in August — inside business hours,
    // even though it is before the configured 08:00 read as UTC.
    expect(
      checkBusinessHours(
        window('2026-08-17T07:30:00.000Z', '2026-08-17T08:00:00.000Z'),
        londonHours,
      ),
    ).toBeNull()
  })
})
