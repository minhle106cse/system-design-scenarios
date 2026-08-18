import type { SchedulerApiRepos } from '@/infrastructure/cqrs/scheduler-api-repos'
import { AssignmentNotFoundError } from '@/common/errors/scheduling.error'
import type { Assignment } from '../../../domain/entities/assignment.entity'
import { RemoveAssignmentCommand } from './remove-assignment.command'
import { RemoveAssignmentHandler } from './remove-assignment.handler'

/**
 * The counterpart to `AddAssignmentHandler`, and deliberately asymmetric with it: no gate replay,
 * because removing a seat cannot violate H1-H4. The handler's own docstring records the one place
 * that reasoning was too strong — a removal CAN drop a shift's only supervisor — and the decision
 * that this still does not become a 422, since a role shortfall is reported by the live-recomputed
 * coverage view rather than blocked here (ADR-0006). The test below pins that decision: an
 * existence check, a delete, and no validation in between.
 */
describe('RemoveAssignmentHandler', () => {
  const assignment: Assignment = {
    id: 'assignment-1',
    scheduleId: 'sched-1',
    staffId: 'ana',
    shiftId: 'am',
    dayOfWeek: 1,
    source: 'AUTO',
  }

  let handler: RemoveAssignmentHandler

  function buildTx(found: Assignment | null): jest.Mocked<SchedulerApiRepos> {
    return {
      assignments: {
        findById: jest.fn().mockResolvedValue(found),
        delete: jest.fn().mockResolvedValue(undefined),
      },
    } as unknown as jest.Mocked<SchedulerApiRepos>
  }

  beforeEach(() => {
    handler = new RemoveAssignmentHandler()
  })

  it('deletes the assignment when it exists', async () => {
    const tx = buildTx(assignment)

    await handler.execute(new RemoveAssignmentCommand(assignment.id), tx)

    expect(tx.assignments.delete).toHaveBeenCalledWith(assignment.id)
  })

  it('throws AssignmentNotFoundError and deletes nothing when the id is unknown', async () => {
    // A repeated DELETE must 404 rather than silently succeeding — the UI distinguishes them.
    const tx = buildTx(null)

    await expect(
      handler.execute(new RemoveAssignmentCommand('already-gone'), tx),
    ).rejects.toBeInstanceOf(AssignmentNotFoundError)

    expect(tx.assignments.delete).not.toHaveBeenCalled()
  })

  it('does not consult staff, shifts or demand — removal needs no feasibility replay', async () => {
    const tx = buildTx(assignment)

    await handler.execute(new RemoveAssignmentCommand(assignment.id), tx)

    // If a future change adds a gate replay here, this test should be the thing that argues with
    // it: the asymmetry with AddAssignmentHandler is intentional, not an oversight.
    expect(tx.staff).toBeUndefined()
    expect(tx.shifts).toBeUndefined()
    expect(tx.demandCells).toBeUndefined()
  })
})
