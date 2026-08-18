import { Injectable } from '@nestjs/common'
import type { ITransactionalCommandHandler } from '@scheduler/shared-kernel'
import { CommandHandler } from '@/infrastructure/cqrs/decorators/command-handler.decorator'
import type { SchedulerApiRepos } from '@/infrastructure/cqrs/scheduler-api-repos'
import { AssignmentNotFoundError } from '@/common/errors/scheduling.error'
import { RemoveAssignmentCommand } from './remove-assignment.command'

/** No `FeasibilityGate` replay needed — removing an assignment can only relax the roster's state, never violate it.
 *
 * 2026-08-18 (stretch-goals plan §2b, D3): that claim is still right about the GATE's three hard
 * constraints (H1-H3, and H4 too — removing a person from a seat cannot make them more available),
 * but is now too strong as a claim about the roster overall — a removal CAN degrade role coverage
 * (e.g. removing a shift's only supervisor). No gate replay is added here regardless: a role
 * shortfall is reported, never blocking (D3, ADR-0006), so `GetCoverageHandler`'s live-recomputed
 * `Diagnostics.roleShortfalls` is where that shows up, not a 422 from this endpoint. */
@Injectable()
@CommandHandler(RemoveAssignmentCommand)
export class RemoveAssignmentHandler implements ITransactionalCommandHandler<
  RemoveAssignmentCommand,
  void,
  SchedulerApiRepos
> {
  readonly kind = 'transactional' as const

  async execute(command: RemoveAssignmentCommand, tx: SchedulerApiRepos): Promise<void> {
    const existing = await tx.assignments.findById(command.assignmentId)
    if (!existing) throw new AssignmentNotFoundError(command.assignmentId)
    await tx.assignments.delete(command.assignmentId)
  }
}
