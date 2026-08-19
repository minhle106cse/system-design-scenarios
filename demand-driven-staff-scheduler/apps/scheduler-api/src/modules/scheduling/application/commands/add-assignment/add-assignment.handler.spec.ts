import type { DayOfWeek } from '@scheduler/scheduling-core'
import type { SchedulerApiRepos } from '@/infrastructure/cqrs/scheduler-api-repos'
import { ScheduleNotFoundError, RosterViolationError } from '@/common/errors/scheduling.error'
import type { Schedule } from '../../../domain/entities/schedule.entity'
import type { StaffMember } from '../../../domain/entities/staff-member.entity'
import type { Shift } from '../../../domain/entities/shift.entity'
import type { Assignment } from '../../../domain/entities/assignment.entity'
import { AddAssignmentCommand } from './add-assignment.command'
import { AddAssignmentHandler } from './add-assignment.handler'

/**
 * The manual-edit path replays the whole roster through the same `FeasibilityGate` auto-schedule
 * uses (assumption 12). These tests exist because this handler is the ONLY place a human can push
 * an assignment into a roster without `generateRoster` — so "does the manual path enforce the same
 * rules as the automatic one?" is answered here or nowhere. The load-bearing case is the last one:
 * a violation belonging to a PRE-EXISTING assignment must not be blamed on the candidate.
 */
describe('AddAssignmentHandler', () => {
  const SCHEDULE_ID = 'sched-1'
  const MONDAY = 1 as DayOfWeek
  const TUESDAY = 2 as DayOfWeek

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

  // The brief's two seeded shifts (8h each), plus one that deliberately overlaps Morning.
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

  const roomy: StaffMember = {
    id: 'staff-roomy',
    scheduleId: SCHEDULE_ID,
    name: 'Roomy',
    maxWeeklyHours: 40,
  }
  const tight: StaffMember = {
    id: 'staff-tight',
    scheduleId: SCHEDULE_ID,
    name: 'Tight',
    maxWeeklyHours: 8,
  }

  let handler: AddAssignmentHandler

  /** Only the repositories this handler touches. The cast is the documented pattern. */
  function buildTx(overrides: {
    schedule?: Schedule | null
    assignments?: Assignment[]
  }): jest.Mocked<SchedulerApiRepos> {
    return {
      schedules: {
        findById: jest
          .fn()
          .mockResolvedValue(overrides.schedule === undefined ? schedule : overrides.schedule),
      },
      staff: { listByScheduleId: jest.fn().mockResolvedValue([roomy, tight]) },
      shifts: { listByScheduleId: jest.fn().mockResolvedValue([morning, evening, midday]) },
      demandCells: { listByScheduleId: jest.fn().mockResolvedValue([]) },
      assignments: {
        listByScheduleId: jest.fn().mockResolvedValue(overrides.assignments ?? []),
        create: jest
          .fn()
          .mockImplementation((scheduleId: string, data: Record<string, unknown>) =>
            Promise.resolve({ id: 'new-assignment', scheduleId, ...data }),
          ),
      },
      unavailability: { listByScheduleId: jest.fn().mockResolvedValue([]) },
    } as unknown as jest.Mocked<SchedulerApiRepos>
  }

  function existing(staffId: string, shiftId: string, day: number): Assignment {
    return {
      id: `${staffId}:${shiftId}:${String(day)}`,
      scheduleId: SCHEDULE_ID,
      staffId,
      shiftId,
      dayOfWeek: day,
      source: 'AUTO',
    }
  }

  beforeEach(() => {
    handler = new AddAssignmentHandler()
  })

  it('throws ScheduleNotFoundError without loading anything else when the schedule is missing', async () => {
    const tx = buildTx({ schedule: null })

    await expect(
      handler.execute(new AddAssignmentCommand(SCHEDULE_ID, roomy.id, morning.id, MONDAY), tx),
    ).rejects.toBeInstanceOf(ScheduleNotFoundError)

    expect(tx.staff.listByScheduleId).not.toHaveBeenCalled()
    expect(tx.assignments.create).not.toHaveBeenCalled()
  })

  it('persists with source MANUAL when the gate raises no objection', async () => {
    const tx = buildTx({})

    const result = await handler.execute(
      new AddAssignmentCommand(SCHEDULE_ID, roomy.id, morning.id, MONDAY),
      tx,
    )

    expect(tx.assignments.create).toHaveBeenCalledWith(SCHEDULE_ID, {
      staffId: roomy.id,
      shiftId: morning.id,
      dayOfWeek: MONDAY,
      source: 'MANUAL',
    })
    // MANUAL, not AUTO: the roster screen distinguishes the two and auto-schedule replaces the lot.
    expect(result.source).toBe('MANUAL')
  })

  it('rejects an assignment that would push the staff member past their weekly cap (H1)', async () => {
    // 8h contracted and 8h already assigned — a second 8h shift is eight hours too many.
    const tx = buildTx({ assignments: [existing(tight.id, morning.id, MONDAY)] })

    await expect(
      handler.execute(new AddAssignmentCommand(SCHEDULE_ID, tight.id, evening.id, TUESDAY), tx),
    ).rejects.toBeInstanceOf(RosterViolationError)

    expect(tx.assignments.create).not.toHaveBeenCalled()
  })

  it('rejects a shift overlapping one the staff member already works that day (H2)', async () => {
    const tx = buildTx({ assignments: [existing(roomy.id, morning.id, MONDAY)] })

    // Midday 10:00-18:00 overlaps Morning 07:00-15:00 on the same day.
    await expect(
      handler.execute(new AddAssignmentCommand(SCHEDULE_ID, roomy.id, midday.id, MONDAY), tx),
    ).rejects.toBeInstanceOf(RosterViolationError)

    expect(tx.assignments.create).not.toHaveBeenCalled()
  })

  it('rejects the same staff member on the same shift on the same day twice (H3)', async () => {
    const tx = buildTx({ assignments: [existing(roomy.id, morning.id, MONDAY)] })

    await expect(
      handler.execute(new AddAssignmentCommand(SCHEDULE_ID, roomy.id, morning.id, MONDAY), tx),
    ).rejects.toBeInstanceOf(RosterViolationError)

    expect(tx.assignments.create).not.toHaveBeenCalled()
  })

  it('allows a second, non-overlapping shift on the same day', async () => {
    const tx = buildTx({ assignments: [existing(roomy.id, morning.id, MONDAY)] })

    // Morning ends at 15:00 exactly where Evening starts — touching is not overlapping.
    await handler.execute(new AddAssignmentCommand(SCHEDULE_ID, roomy.id, evening.id, MONDAY), tx)

    expect(tx.assignments.create).toHaveBeenCalledTimes(1)
  })

  it('does NOT blame the candidate for a violation owned by a pre-existing assignment', async () => {
    // `tight` is already over their own cap (16h assigned against 8h contracted) — a genuine
    // pre-existing violation that validateRoster reports on every replay, e.g. because the contract
    // was lowered after auto-schedule ran. Adding a perfectly legal assignment for someone ELSE
    // must still succeed: this endpoint owns its candidate, not the rest of the roster.
    const tx = buildTx({
      assignments: [existing(tight.id, morning.id, MONDAY), existing(tight.id, evening.id, MONDAY)],
    })

    await handler.execute(new AddAssignmentCommand(SCHEDULE_ID, roomy.id, morning.id, TUESDAY), tx)

    expect(tx.assignments.create).toHaveBeenCalledWith(SCHEDULE_ID, {
      staffId: roomy.id,
      shiftId: morning.id,
      dayOfWeek: TUESDAY,
      source: 'MANUAL',
    })
  })
})
