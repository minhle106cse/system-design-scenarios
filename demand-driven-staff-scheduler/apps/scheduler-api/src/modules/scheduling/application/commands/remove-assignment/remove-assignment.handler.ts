import { Injectable } from '@nestjs/common'
import type { ITransactionalCommandHandler } from '@scheduler/shared-kernel'
import { CommandHandler } from '@/infrastructure/cqrs/decorators/command-handler.decorator'
import type { SchedulerApiRepos } from '@/infrastructure/cqrs/scheduler-api-repos'
import { AssignmentNotFoundError } from '@/common/errors/scheduling.error'
import { RemoveAssignmentCommand } from './remove-assignment.command'

/** No `FeasibilityGate` replay needed — removing an assignment can only relax the roster's state, never violate it. */
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
