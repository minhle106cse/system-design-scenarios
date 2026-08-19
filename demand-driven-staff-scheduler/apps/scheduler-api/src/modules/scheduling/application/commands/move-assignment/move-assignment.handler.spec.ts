import type { DayOfWeek } from '@scheduler/scheduling-core'
import type { SchedulerApiRepos } from '@/infrastructure/cqrs/scheduler-api-repos'
import {
  AssignmentNotFoundError,
  ScheduleNotFoundError,
  RosterViolationError,
} from '@/common/errors/scheduling.error'
import type { Schedule } from '../../../domain/entities/schedule.entity'
import type { StaffMember } from '../../../domain/entities/staff-member.entity'
import type { Shift } from '../../../domain/entities/shift.entity'
import type { Assignment } from '../../../domain/entities/assignment.entity'
import type { StaffUnavailability } from '../../../domain/entities/staff-unavailability.entity'
import { MoveAssignmentCommand } from './move-assignment.command'
import { MoveAssignmentHandler } from './move-assignment.handler'

/**
 * The regression this handler exists for is the FIRST test: a fully-loaded staff member being
 * moved. Every other endpoint was individually correct while drag-and-drop was still broken,
 * because the bug lived in the *composition* of add-then-remove — so it is pinned here, at the
 * one operation that now replaces that composition, and nowhere else.
 */
describe('MoveAssignmentHandler', () => {
  const SCHEDULE_ID = 'sched-1'
  const MONDAY = 1 as DayOfWeek
  const TUESDAY = 2 as DayOfWeek
  const WEDNESDAY = 3 as DayOfWeek

  const schedule: Schedule = {
    id: SCHEDULE_ID,
    name: 'Test week',
    transactionsPerStaffHour: 18,
    minStaffWhenOpen: 1,
    maxStaffPerHour: null,
    minUtilisationTarget: 0.6,
    createdAt: new Date('2026-08-01'),
    updatedAt: new Date('2026-08-01'),
    staffUpdatedAt: null,
    shiftsUpdatedAt: null,
    demandUpdatedAt: null,
    rolesUpdatedAt: null,
  }

  const morning: Shift = {
    id: 'shift-am',
    scheduleId: SCHEDULE_ID,
    label: 'Morning',
    startMinute: 7 * 60,
    endMinute: 15 * 60,
  }
  const evening: Shift = {
    id: 'shift-pm',
    scheduleId: SCHEDULE_ID,
    label: 'Evening',
    startMinute: 15 * 60,
    endMinute: 23 * 60,
  }
  const midday: Shift = {
    id: 'shift-mid',
    scheduleId: SCHEDULE_ID,
    label: 'Midday',
    startMinute: 10 * 60,
    endMinute: 18 * 60,
  }

  /** Contracted for exactly two 8h shifts — the seeded roster's 100%-utilisation case. */
  const maxedOut: StaffMember = {
    id: 'staff-maxed',
    scheduleId: SCHEDULE_ID,
    name: 'Maxed',
    maxWeeklyHours: 16,
  }

  let handler: MoveAssignmentHandler

  function assignment(
    id: string,
    staffId: string,
    shiftId: string,
    day: number,
    source: 'AUTO' | 'MANUAL' = 'AUTO',
  ): Assignment {
    return { id, scheduleId: SCHEDULE_ID, staffId, shiftId, dayOfWeek: day, source }
  }

  /** Only the repositories this handler touches. The cast is the documented pattern. */
  function buildTx(overrides: {
    schedule?: Schedule | null
    moving?: Assignment | null
    assignments?: Assignment[]
    unavailability?: StaffUnavailability[]
  }): jest.Mocked<SchedulerApiRepos> {
    const assignments = overrides.assignments ?? []
    return {
      schedules: {
        findById: jest
          .fn()
          .mockResolvedValue(overrides.schedule === undefined ? schedule : overrides.schedule),
      },
      staff: { listByScheduleId: jest.fn().mockResolvedValue([maxedOut]) },
      shifts: { listByScheduleId: jest.fn().mockResolvedValue([morning, evening, midday]) },
      demandCells: { listByScheduleId: jest.fn().mockResolvedValue([]) },
      assignments: {
        findById: jest
          .fn()
          .mockResolvedValue(overrides.moving === undefined ? assignments[0] : overrides.moving),
        listByScheduleId: jest.fn().mockResolvedValue(assignments),
        move: jest
          .fn()
          .mockImplementation((id: string, data: Record<string, unknown>) =>
            Promise.resolve({ id, scheduleId: SCHEDULE_ID, source: 'MANUAL', ...data }),
          ),
      },
      unavailability: {
        listByScheduleId: jest.fn().mockResolvedValue(overrides.unavailability ?? []),
      },
    } as unknown as jest.Mocked<SchedulerApiRepos>
  }

  beforeEach(() => {
    handler = new MoveAssignmentHandler()
  })

  it('⭐ moves a staff member who is already at 100% of their weekly cap — the drag-and-drop regression', async () => {
    // 16h contracted, 16h assigned. Moving one of those two shifts to another day leaves the
    // weekly total at exactly 16h, so H1 must not fire. Validating the destination against a
    // roster that still contained the source (what add-then-remove did) reported 24h vs 16h and
    // rejected every such move — which, on the seeded team, is most of the roster.
    const source = assignment('a-1', maxedOut.id, morning.id, MONDAY)
    const tx = buildTx({
      moving: source,
      assignments: [source, assignment('a-2', maxedOut.id, evening.id, MONDAY)],
    })

    const result = await handler.execute(
      new MoveAssignmentCommand(SCHEDULE_ID, 'a-1', morning.id, WEDNESDAY),
      tx,
    )

    expect(tx.assignments.move).toHaveBeenCalledWith('a-1', {
      shiftId: morning.id,
      dayOfWeek: WEDNESDAY,
    })
    // The seat keeps its id — the roster grid's drag payload stays valid across the move.
    expect(result.id).toBe('a-1')
    expect(result.source).toBe('MANUAL')
  })

  it('still rejects a move into a shift overlapping one the staff member already works that day (H2)', async () => {
    const source = assignment('a-1', maxedOut.id, morning.id, MONDAY)
    const tx = buildTx({
      moving: source,
      assignments: [source, assignment('a-2', maxedOut.id, evening.id, TUESDAY)],
    })

    // Midday 10:00-18:00 overlaps the Evening 15:00-23:00 already worked on Tuesday.
    await expect(
      handler.execute(new MoveAssignmentCommand(SCHEDULE_ID, 'a-1', midday.id, TUESDAY), tx),
    ).rejects.toBeInstanceOf(RosterViolationError)

    expect(tx.assignments.move).not.toHaveBeenCalled()
  })

  it('still rejects a move onto a (day, shift) the staff member already works (H3)', async () => {
    const source = assignment('a-1', maxedOut.id, morning.id, MONDAY)
    const tx = buildTx({
      moving: source,
      assignments: [source, assignment('a-2', maxedOut.id, evening.id, TUESDAY)],
    })

    await expect(
      handler.execute(new MoveAssignmentCommand(SCHEDULE_ID, 'a-1', evening.id, TUESDAY), tx),
    ).rejects.toBeInstanceOf(RosterViolationError)

    expect(tx.assignments.move).not.toHaveBeenCalled()
  })

  it('still rejects a move into the staff member’s own unavailability window (H4)', async () => {
    const source = assignment('a-1', maxedOut.id, morning.id, MONDAY)
    const tx = buildTx({
      moving: source,
      assignments: [source],
      unavailability: [
        {
          id: 'u-1',
          staffId: maxedOut.id,
          dayOfWeek: WEDNESDAY,
          startMinute: 0,
          endMinute: 24 * 60,
        },
      ],
    })

    await expect(
      handler.execute(new MoveAssignmentCommand(SCHEDULE_ID, 'a-1', morning.id, WEDNESDAY), tx),
    ).rejects.toBeInstanceOf(RosterViolationError)

    expect(tx.assignments.move).not.toHaveBeenCalled()
  })

  it('throws AssignmentNotFoundError when the assignment belongs to a different schedule', async () => {
    const foreign = { ...assignment('a-1', maxedOut.id, morning.id, MONDAY), scheduleId: 'other' }
    const tx = buildTx({ moving: foreign, assignments: [] })

    await expect(
      handler.execute(new MoveAssignmentCommand(SCHEDULE_ID, 'a-1', evening.id, TUESDAY), tx),
    ).rejects.toBeInstanceOf(AssignmentNotFoundError)

    expect(tx.assignments.move).not.toHaveBeenCalled()
  })

  it('throws ScheduleNotFoundError without loading anything else when the schedule is missing', async () => {
    const tx = buildTx({ schedule: null, moving: null })

    await expect(
      handler.execute(new MoveAssignmentCommand(SCHEDULE_ID, 'a-1', evening.id, TUESDAY), tx),
    ).rejects.toBeInstanceOf(ScheduleNotFoundError)

    expect(tx.staff.listByScheduleId).not.toHaveBeenCalled()
    expect(tx.assignments.move).not.toHaveBeenCalled()
  })
})
