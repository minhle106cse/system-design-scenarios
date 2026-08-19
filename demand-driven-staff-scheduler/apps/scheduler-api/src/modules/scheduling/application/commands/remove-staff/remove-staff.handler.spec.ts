import type { SchedulerApiRepos } from '@/infrastructure/cqrs/scheduler-api-repos'
import { StaffMemberNotFoundError } from '@/common/errors/scheduling.error'
import type { StaffMember } from '../../../domain/entities/staff-member.entity'
import { RemoveStaffCommand } from './remove-staff.command'
import { RemoveStaffHandler } from './remove-staff.handler'

/**
 * Regression cover for a real 500. StaffMember is SOFT-deleted, so its row survives, but its
 * assignments used to survive too — and `FeasibilityGate.eligible` THROWS on a staffId that is no
 * longer in `SchedulingInput.staff` (by design: scheduling-core treats an unknown id as a caller
 * bug, not a feasibility case). `GetCoverageHandler` replays every persisted assignment through
 * that gate, so one removed staff member turned every later coverage read into a 500 — and stayed
 * broken, because nothing else cleaned the dangling rows up.
 */
describe('RemoveStaffHandler', () => {
  const staff: StaffMember = {
    id: 'staff-1',
    scheduleId: 'sched-1',
    name: 'Ana',
    maxWeeklyHours: 40,
  }

  let handler: RemoveStaffHandler

  function buildTx(found: StaffMember | null): jest.Mocked<SchedulerApiRepos> {
    return {
      staff: {
        findById: jest.fn().mockResolvedValue(found),
        softDelete: jest.fn().mockResolvedValue(undefined),
      },
      assignments: { deleteByStaffId: jest.fn().mockResolvedValue(5) },
    } as unknown as jest.Mocked<SchedulerApiRepos>
  }

  beforeEach(() => {
    handler = new RemoveStaffHandler()
  })

  it('deletes the staff member’s assignments before soft-deleting them', async () => {
    const tx = buildTx(staff)

    await handler.execute(new RemoveStaffCommand(staff.id), tx)

    expect(tx.assignments.deleteByStaffId).toHaveBeenCalledWith(staff.id)
    expect(tx.staff.softDelete).toHaveBeenCalledWith(staff.id)
  })

  it('throws StaffMemberNotFoundError and touches nothing when the id is unknown', async () => {
    const tx = buildTx(null)

    await expect(handler.execute(new RemoveStaffCommand('missing'), tx)).rejects.toBeInstanceOf(
      StaffMemberNotFoundError,
    )

    expect(tx.assignments.deleteByStaffId).not.toHaveBeenCalled()
    expect(tx.staff.softDelete).not.toHaveBeenCalled()
  })
})
