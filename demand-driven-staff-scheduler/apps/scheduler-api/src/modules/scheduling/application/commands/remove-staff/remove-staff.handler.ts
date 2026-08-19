import { Injectable } from '@nestjs/common'
import type { ITransactionalCommandHandler } from '@scheduler/shared-kernel'
import { CommandHandler } from '@/infrastructure/cqrs/decorators/command-handler.decorator'
import type { SchedulerApiRepos } from '@/infrastructure/cqrs/scheduler-api-repos'
import { StaffMemberNotFoundError } from '@/common/errors/scheduling.error'
import { RemoveStaffCommand } from './remove-staff.command'

@Injectable()
@CommandHandler(RemoveStaffCommand)
export class RemoveStaffHandler implements ITransactionalCommandHandler<
  RemoveStaffCommand,
  void,
  SchedulerApiRepos
> {
  readonly kind = 'transactional' as const

  async execute(command: RemoveStaffCommand, tx: SchedulerApiRepos): Promise<void> {
    const existing = await tx.staff.findById(command.staffId)
    if (!existing) throw new StaffMemberNotFoundError(command.staffId)
    // Cascade first: staff is SOFT-deleted, so its row survives, but an assignment
    // pointing at a removed one is meaningless -- and `FeasibilityGate.eligible` THROWS on a
    // staffId that is no longer in `SchedulingInput.staff`, which turned every later coverage
    // read into a 500 (see the repository interface's note).
    await tx.assignments.deleteByStaffId(command.staffId)
    await tx.staff.softDelete(command.staffId)
  }
}
