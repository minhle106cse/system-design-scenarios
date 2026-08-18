import { Injectable } from '@nestjs/common'
import type { ITransactionalCommandHandler } from '@scheduler/shared-kernel'
import { CommandHandler } from '@/infrastructure/cqrs/decorators/command-handler.decorator'
import type { SchedulerApiRepos } from '@/infrastructure/cqrs/scheduler-api-repos'
import { UnavailabilityWindowNotFoundError } from '@/common/errors/scheduling.error'
import { RemoveUnavailabilityCommand } from './remove-unavailability.command'

/** No `FeasibilityGate` replay needed — removing an unavailability window can only relax H4, never
 *  create a violation (same reasoning as `RemoveAssignmentHandler`). */
@Injectable()
@CommandHandler(RemoveUnavailabilityCommand)
export class RemoveUnavailabilityHandler implements ITransactionalCommandHandler<
  RemoveUnavailabilityCommand,
  void,
  SchedulerApiRepos
> {
  readonly kind = 'transactional' as const

  async execute(command: RemoveUnavailabilityCommand, tx: SchedulerApiRepos): Promise<void> {
    const existing = await tx.unavailability.findById(command.windowId)
    if (!existing) throw new UnavailabilityWindowNotFoundError(command.windowId)
    await tx.unavailability.delete(command.windowId)
  }
}
