import { describe, expect, it } from 'vitest'
import type { Schedule, ScheduleRun } from './api-client'
import { rosterStatus } from './staleness'

const schedule: Schedule = {
  id: 'sched-1',
  name: 'Week',
  transactionsPerStaffHour: 18,
  minStaffWhenOpen: 1,
  maxStaffPerHour: null,
  minUtilisationTarget: 0.6,
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
}

function run(parameters: unknown): ScheduleRun {
  return {
    id: 'run-1',
    scheduleId: 'sched-1',
    generatedAt: '2026-08-01T00:00:00.000Z',
    parameters,
    diagnostics: {},
  }
}

const matching = {
  transactionsPerStaffHour: 18,
  minStaffWhenOpen: 1,
  minUtilisationTarget: 0.6,
}

describe('rosterStatus', () => {
  it('reports NEVER_RUN when auto-schedule has not been run', () => {
    expect(rosterStatus(schedule, null)).toEqual({ kind: 'NEVER_RUN' })
  })

  it('reports CURRENT when the run used the parameters now on the schedule', () => {
    expect(rosterStatus(schedule, run(matching))).toEqual({ kind: 'CURRENT' })
  })

  it('does NOT report a change when maxStaffPerHour is "no cap" on both sides', () => {
    // The stored run omits the key entirely; the schedule row holds `null`. A raw !== would
    // report a change on literally every read, which would make the warning meaningless.
    expect(rosterStatus(schedule, run(matching)).kind).toBe('CURRENT')
  })

  it('names N when it changed since the run — the case that moved coverage silently', () => {
    const status = rosterStatus(schedule, run({ ...matching, transactionsPerStaffHour: 15 }))

    expect(status.kind).toBe('STALE')
    expect(status.kind === 'STALE' && status.changed).toEqual(['Transactions per staff hour (N)'])
  })

  it('names every changed parameter, not just the first', () => {
    const status = rosterStatus(
      schedule,
      run({ transactionsPerStaffHour: 15, minStaffWhenOpen: 2, minUtilisationTarget: 0.9 }),
    )

    expect(status.kind === 'STALE' && status.changed).toEqual([
      'Transactions per staff hour (N)',
      'Min staff when open',
      'Fair-share target',
    ])
  })

  it('detects a cap being introduced after the run', () => {
    const status = rosterStatus({ ...schedule, maxStaffPerHour: 4 }, run(matching))

    expect(status.kind === 'STALE' && status.changed).toEqual(['Max staff per hour'])
  })

  it('treats a run with no stored parameters as stale rather than crashing', () => {
    expect(rosterStatus(schedule, run(null)).kind).toBe('STALE')
  })
})
