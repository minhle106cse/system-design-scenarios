import { describe, expect, it } from 'vitest'
import { dayLabel, formatMinutes, parseTime, shiftHours } from './week'

describe('week', () => {
  it('labels day-of-week 1-7 as Mon..Sun', () => {
    expect(dayLabel(1)).toBe('Mon')
    expect(dayLabel(7)).toBe('Sun')
  })

  it('falls back to a numbered label for an out-of-range day', () => {
    expect(dayLabel(9)).toBe('Day 9')
  })

  it('formats minutes-from-midnight as HH:mm', () => {
    expect(formatMinutes(420)).toBe('07:00')
    expect(formatMinutes(0)).toBe('00:00')
    expect(formatMinutes(1439)).toBe('23:59')
  })

  it('parses HH:mm back into minutes-from-midnight', () => {
    expect(parseTime('07:00')).toBe(420)
    expect(parseTime('23:59')).toBe(1439)
  })

  it('rejects malformed or out-of-range time strings instead of returning NaN', () => {
    expect(parseTime('not-a-time')).toBeNull()
    expect(parseTime('24:00')).toBeNull()
    expect(parseTime('07:60')).toBeNull()
  })

  it('computes shift length in hours', () => {
    expect(shiftHours({ startMinute: 420, endMinute: 900 })).toBe(8)
  })
})
