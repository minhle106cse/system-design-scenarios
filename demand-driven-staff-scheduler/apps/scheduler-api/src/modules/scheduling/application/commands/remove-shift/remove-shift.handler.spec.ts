import type { SchedulerApiRepos } from '@/infrastructure/cqrs/scheduler-api-repos'
import { ShiftNotFoundError } from '@/common/errors/scheduling.error'
import type { Shift } from '../../../domain/entities/shift.entity'
import { RemoveShiftCommand } from './remove-shift.command'
import { RemoveShiftHandler } from './remove-shift.handler'

/**
 * The sibling of `RemoveStaffHandler`'s cascade, for the same reason but a milder symptom: Shift
 * is SOFT-deleted, so its row survives and its assignments used to survive with it. That never
 * threw the way a dangling STAFF reference did (`GetCoverageHandler` already skipped assignments
 * whose shift it could not resolve), but it left invisible rows that still counted as the staff
 * member's booked hours on every later read — a quieter wrong answer rather than a loud one.
 */
describe('RemoveShiftHandler', () => {
  const shift: Shift = {
    id: 'shift-1',
    scheduleId: 'sched-1',
    label: 'Morning',
    startMinute: 7 * 60,
    endMinute: 15 * 60,
  }

  let handler: RemoveShiftHandler

  function buildTx(found: Shift | null): jest.Mocked<SchedulerApiRepos> {
    return {
      shifts: {
        findById: jest.fn().mockResolvedValue(found),
        softDelete: jest.fn().mockResolvedValue(undefined),
      },
      assignments: { deleteByShiftId: jest.fn().mockResolvedValue(7) },
    } as unknown as jest.Mocked<SchedulerApiRepos>
  }

  beforeEach(() => {
    handler = new RemoveShiftHandler()
  })

  it('deletes the shift’s assignments before soft-deleting it', async () => {
    const tx = buildTx(shift)

    await handler.execute(new RemoveShiftCommand(shift.id), tx)

    expect(tx.assignments.deleteByShiftId).toHaveBeenCalledWith(shift.id)
    expect(tx.shifts.softDelete).toHaveBeenCalledWith(shift.id)
  })

  it('throws ShiftNotFoundError and touches nothing when the id is unknown', async () => {
    const tx = buildTx(null)

    await expect(handler.execute(new RemoveShiftCommand('missing'), tx)).rejects.toBeInstanceOf(
      ShiftNotFoundError,
    )

    expect(tx.assignments.deleteByShiftId).not.toHaveBeenCalled()
    expect(tx.shifts.softDelete).not.toHaveBeenCalled()
  })
})
