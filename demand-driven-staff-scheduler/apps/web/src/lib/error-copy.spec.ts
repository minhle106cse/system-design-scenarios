import { describe, expect, it } from 'vitest'
import { ApiError } from './api-client'
import { describeApiError, describeViolation } from './error-copy'

const staffById = new Map([
  ['s1', { id: 's1', scheduleId: 'sched', name: 'Anna', maxWeeklyHours: 20 }],
])
const shiftById = new Map([
  [
    'sh1',
    {
      id: 'sh1',
      scheduleId: 'sched',
      label: 'Morning',
      startMinute: 420,
      endMinute: 900,
    },
  ],
])

describe('error-copy', () => {
  it('explains WOULD_EXCEED_MAX_HOURS with the staff name, their cap, and what to do', () => {
    const msg = describeViolation(
      {
        staffId: 's1',
        shiftId: 'sh1',
        day: 1,
        reason: 'WOULD_EXCEED_MAX_HOURS',
      },
      staffById,
      shiftById,
    )
    expect(msg).toContain('Anna')
    expect(msg).toContain('20-hour')
    expect(msg).toMatch(/raise|pick someone else/i)
  })

  it('falls back to a generic phrase when the staff/shift id is unknown', () => {
    const msg = describeViolation(
      { staffId: 'ghost', shiftId: 'ghost', day: 1, reason: 'UNAVAILABLE' },
      staffById,
      shiftById,
    )
    expect(msg).toContain('This staff member')
  })

  it('joins every violation in a ROSTER_VIOLATION into one readable message', () => {
    const err = new ApiError(
      'ROSTER_VIOLATION',
      'Assignment violates a scheduling constraint',
      422,
      {
        violations: [
          {
            staffId: 's1',
            shiftId: 'sh1',
            day: 1,
            reason: 'WOULD_EXCEED_MAX_HOURS',
          },
        ],
      },
    )
    const msg = describeApiError(err, { staffById, shiftById })
    expect(msg).toContain('Anna')
  })

  it('gives a plain-language sentence for INVALID_SHIFT_TIME_RANGE', () => {
    const err = new ApiError('INVALID_SHIFT_TIME_RANGE', 'endMinute must be...', 422)
    expect(describeApiError(err)).toMatch(/end after it starts/)
  })

  it('falls back to a network-failure sentence for a non-ApiError', () => {
    expect(describeApiError(new Error('boom'))).toBe('Could not reach the scheduling service.')
  })
})
