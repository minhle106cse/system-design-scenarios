import type { SchedulerApiRepos } from '@/infrastructure/cqrs/scheduler-api-repos'
import { ScheduleNotFoundError } from '@/common/errors/scheduling.error'
import type { Schedule } from '../../../domain/entities/schedule.entity'
import type { StaffMember } from '../../../domain/entities/staff-member.entity'
import type { Shift } from '../../../domain/entities/shift.entity'
import type { DemandCell } from '../../../domain/entities/demand-cell.entity'
import { AutoScheduleCommand } from './auto-schedule.command'
import { AutoScheduleHandler } from './auto-schedule.handler'

/**
 * The brief's §2.5 endpoint. `generateRoster` is the business logic and is proven separately over
 * generated inputs (ADR-0004) — what is unproven until here is the ORCHESTRATION around it: that
 * the roster is persisted as a full replace (assumption 11, which is what makes this endpoint
 * idempotent and why no idempotency store exists), that a run is recorded, and — the case the
 * brief cares about most — that an infeasible week is reported rather than thrown.
 */
describe('AutoScheduleHandler', () => {
  const SCHEDULE_ID = 'sched-1'

  const schedule: Schedule = {
    id: SCHEDULE_ID,
    name: 'Test week',
    transactionsPerStaffHour: 18,
    minStaffWhenOpen: 1,
    maxStaffPerHour: null,
    minUtilisationTarget: 0.6,
    createdAt: new Date('2026-08-01'),
    updatedAt: new Date('2026-08-01'),
  }

  const morning: Shift = {
    id: 'am',
    scheduleId: SCHEDULE_ID,
    label: 'Morning',
    startMinute: 7 * 60,
    endMinute: 15 * 60,
  }

  const ana: StaffMember = { id: 'ana', scheduleId: SCHEDULE_ID, name: 'Ana', maxWeeklyHours: 40 }
  const ben: StaffMember = { id: 'ben', scheduleId: SCHEDULE_ID, name: 'Ben', maxWeeklyHours: 40 }

  /** Monday 07:00-14:00, busy enough to need more than one person at 18 txn/staff-hour. */
  const busyMonday: DemandCell[] = [7, 8, 9, 10, 11, 12, 13].map((hour) => ({
    id: `mon-${String(hour)}`,
    scheduleId: SCHEDULE_ID,
    dayOfWeek: 1,
    hour,
    transactions: 40,
  }))

  let handler: AutoScheduleHandler

  function buildTx(overrides: {
    schedule?: Schedule | null
    staff?: StaffMember[]
    demandCells?: DemandCell[]
  }): jest.Mocked<SchedulerApiRepos> {
    return {
      schedules: {
        findById: jest
          .fn()
          .mockResolvedValue(overrides.schedule === undefined ? schedule : overrides.schedule),
      },
      staff: { listByScheduleId: jest.fn().mockResolvedValue(overrides.staff ?? [ana, ben]) },
      shifts: { listByScheduleId: jest.fn().mockResolvedValue([morning]) },
      demandCells: {
        listByScheduleId: jest.fn().mockResolvedValue(overrides.demandCells ?? busyMonday),
      },
      unavailability: { listByScheduleId: jest.fn().mockResolvedValue([]) },
      staffRoles: { listByScheduleId: jest.fn().mockResolvedValue([]) },
      shiftRoleRequirements: { listByScheduleId: jest.fn().mockResolvedValue([]) },
      assignments: { replaceAll: jest.fn().mockResolvedValue(undefined) },
      runs: { create: jest.fn().mockResolvedValue(undefined) },
    } as unknown as jest.Mocked<SchedulerApiRepos>
  }

  beforeEach(() => {
    handler = new AutoScheduleHandler()
  })

  it('throws ScheduleNotFoundError and writes nothing when the schedule is missing', async () => {
    const tx = buildTx({ schedule: null })

    await expect(handler.execute(new AutoScheduleCommand(SCHEDULE_ID), tx)).rejects.toBeInstanceOf(
      ScheduleNotFoundError,
    )

    expect(tx.assignments.replaceAll).not.toHaveBeenCalled()
    expect(tx.runs.create).not.toHaveBeenCalled()
  })

  it('persists the generated roster as a FULL REPLACE, not an append', async () => {
    const tx = buildTx({})

    await handler.execute(new AutoScheduleCommand(SCHEDULE_ID), tx)

    // Assumption 11: running twice on unchanged data yields the same roster, which is what makes
    // this endpoint idempotent by construction.
    expect(tx.assignments.replaceAll).toHaveBeenCalledTimes(1)
    // jest.Mocked<T> does not deep-mock nested repository objects, so reach for .mock through
    // an explicit jest.Mock cast rather than widening the whole repos type.
    const replaceAll = tx.assignments.replaceAll as unknown as jest.Mock
    const [scheduleIdArg, rows] = replaceAll.mock.calls[0] as [
      string,
      { staffId: string; shiftId: string; dayOfWeek: number; source: string }[],
    ]
    expect(scheduleIdArg).toBe(SCHEDULE_ID)
    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) {
      expect(row.source).toBe('AUTO')
      expect([ana.id, ben.id]).toContain(row.staffId)
      expect(row.shiftId).toBe(morning.id)
    }
  })

  it('records a ScheduleRun carrying the parameters actually used and the diagnostics produced', async () => {
    const tx = buildTx({})

    const result = await handler.execute(new AutoScheduleCommand(SCHEDULE_ID), tx)

    expect(tx.runs.create).toHaveBeenCalledTimes(1)
    const runsCreate = tx.runs.create as unknown as jest.Mock
    const run = runsCreate.mock.calls[0][0] as {
      scheduleId: string
      parameters: { transactionsPerStaffHour: number }
      diagnostics: unknown
    }
    expect(run.scheduleId).toBe(SCHEDULE_ID)
    expect(run.parameters.transactionsPerStaffHour).toBe(18)
    expect(run.diagnostics).toEqual(result.diagnostics)
  })

  it('never exceeds a staff member’s contracted weekly hours', async () => {
    // One person, 8 contracted hours, a whole week of demand to cover: the cap must win.
    const soloWeek: DemandCell[] = [1, 2, 3, 4, 5].flatMap((day) =>
      [7, 8, 9, 10, 11, 12, 13].map((hour) => ({
        id: `d${String(day)}-h${String(hour)}`,
        scheduleId: SCHEDULE_ID,
        dayOfWeek: day,
        hour,
        transactions: 60,
      })),
    )
    const tx = buildTx({
      staff: [{ id: 'solo', scheduleId: SCHEDULE_ID, name: 'Solo', maxWeeklyHours: 8 }],
      demandCells: soloWeek,
    })

    const result = await handler.execute(new AutoScheduleCommand(SCHEDULE_ID), tx)

    // The shift is 8h, so exactly one assignment fits inside an 8h contract.
    expect(result.roster.assignments).toHaveLength(1)
    const solo = result.diagnostics.staff.find((s) => s.staffId === 'solo')
    expect(solo?.assignedHours).toBeLessThanOrEqual(8)
  })

  it('reports an under-resourced week through diagnostics instead of throwing', async () => {
    // The brief's explicit instruction: surface the outcome, never fail silently or loudly.
    const tx = buildTx({
      staff: [{ id: 'solo', scheduleId: SCHEDULE_ID, name: 'Solo', maxWeeklyHours: 8 }],
    })

    const result = await handler.execute(new AutoScheduleCommand(SCHEDULE_ID), tx)

    expect(result.diagnostics.structural.floorStaffHours).toBeGreaterThan(
      result.diagnostics.structural.contractedStaffHours,
    )
    // Still a successful call that persisted whatever was feasible.
    expect(tx.assignments.replaceAll).toHaveBeenCalledTimes(1)
  })

  it('produces an empty roster, not an error, when there is no demand at all', async () => {
    const tx = buildTx({ demandCells: [] })

    const result = await handler.execute(new AutoScheduleCommand(SCHEDULE_ID), tx)

    expect(result.roster.assignments).toEqual([])
    expect(tx.assignments.replaceAll).toHaveBeenCalledWith(SCHEDULE_ID, [])
  })
})
