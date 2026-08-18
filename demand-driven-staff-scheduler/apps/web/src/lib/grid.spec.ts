import { describe, expect, it } from 'vitest'
import {
  buildCoverageGrid,
  buildDemandGrid,
  buildRosterGrid,
  demandGridKey,
  maxValue,
  rosterGridKey,
} from './grid'

describe('grid', () => {
  it('keys demand cells by day:hour', () => {
    const grid = buildDemandGrid([
      { id: '1', scheduleId: 's', dayOfWeek: 1, hour: 7, transactions: 12 },
      { id: '2', scheduleId: 's', dayOfWeek: 5, hour: 18, transactions: 40 },
    ])
    expect(grid.get(demandGridKey(1, 7))).toBe(12)
    expect(grid.get(demandGridKey(5, 18))).toBe(40)
    expect(grid.get(demandGridKey(2, 7))).toBeUndefined()
  })

  it('groups assignments by day:shiftId, preserving multiple staff on one cell', () => {
    const grid = buildRosterGrid([
      {
        id: '1',
        scheduleId: 's',
        staffId: 'a',
        shiftId: 'shift-1',
        dayOfWeek: 1,
        source: 'AUTO',
      },
      {
        id: '2',
        scheduleId: 's',
        staffId: 'b',
        shiftId: 'shift-1',
        dayOfWeek: 1,
        source: 'MANUAL',
      },
      {
        id: '3',
        scheduleId: 's',
        staffId: 'c',
        shiftId: 'shift-2',
        dayOfWeek: 1,
        source: 'AUTO',
      },
    ])
    expect(grid.get(rosterGridKey(1, 'shift-1'))).toHaveLength(2)
    expect(grid.get(rosterGridKey(1, 'shift-2'))).toHaveLength(1)
  })

  it('keys coverage diagnostics by day:hour', () => {
    const grid = buildCoverageGrid([
      { day: 3, hour: 10, required: 2, scheduled: 1, status: 'UNDERSTAFFED' },
    ])
    expect(grid.get(demandGridKey(3, 10))?.status).toBe('UNDERSTAFFED')
  })

  it('maxValue returns 0 for an empty iterable, not -Infinity', () => {
    expect(maxValue([])).toBe(0)
    expect(maxValue([3, 9, 1])).toBe(9)
  })
})
