import { describe, expect, it } from 'vitest'
import { formatWindow, isDayOff, windowsForStaff } from './availability'
import type { StaffUnavailability } from './api-client'

describe('isDayOff', () => {
  it('is true for a full 0-1440 window', () => {
    expect(isDayOff({ startMinute: 0, endMinute: 1440 })).toBe(true)
  })

  it('is false for a partial window', () => {
    expect(isDayOff({ startMinute: 900, endMinute: 1380 })).toBe(false)
  })
})

describe('formatWindow', () => {
  it('labels a day-off window as "Day: day off"', () => {
    const w: StaffUnavailability = {
      id: 'w1',
      staffId: 's1',
      dayOfWeek: 2,
      startMinute: 0,
      endMinute: 1440,
    }
    expect(formatWindow(w)).toBe('Tue: day off')
  })

  it('labels a partial window with its time range', () => {
    const w: StaffUnavailability = {
      id: 'w2',
      staffId: 's1',
      dayOfWeek: 3,
      startMinute: 900,
      endMinute: 1380,
    }
    expect(formatWindow(w)).toBe('Wed 15:00–23:00')
  })
})

describe('windowsForStaff', () => {
  it('filters to just the given staff member, in original order', () => {
    const all: StaffUnavailability[] = [
      { id: 'w1', staffId: 's1', dayOfWeek: 1, startMinute: 0, endMinute: 1440 },
      { id: 'w2', staffId: 's2', dayOfWeek: 2, startMinute: 0, endMinute: 1440 },
      { id: 'w3', staffId: 's1', dayOfWeek: 4, startMinute: 900, endMinute: 1380 },
    ]
    expect(windowsForStaff(all, 's1').map((w) => w.id)).toEqual(['w1', 'w3'])
  })

  it('returns an empty array when the staff member has no windows', () => {
    expect(windowsForStaff([], 's1')).toEqual([])
  })
})
