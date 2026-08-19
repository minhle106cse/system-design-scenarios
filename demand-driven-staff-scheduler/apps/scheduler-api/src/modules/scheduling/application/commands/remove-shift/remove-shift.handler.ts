import { Injectable } from '@nestjs/common'
import type { ITransactionalCommandHandler } from '@scheduler/shared-kernel'
import { CommandHandler } from '@/infrastructure/cqrs/decorators/command-handler.decorator'
import type { SchedulerApiRepos } from '@/infrastructure/cqrs/scheduler-api-repos'
import { ShiftNotFoundError } from '@/common/errors/scheduling.error'
import { RemoveShiftCommand } from './remove-shift.command'

@Injectable()
@CommandHandler(RemoveShiftCommand)
export class RemoveShiftHandler implements ITransactionalCommandHandler<
  RemoveShiftCommand,
  void,
  SchedulerApiRepos
> {
  readonly kind = 'transactional' as const

  async execute(command: RemoveShiftCommand, tx: SchedulerApiRepos): Promise<void> {
    const existing = await tx.shifts.findById(command.shiftId)
    if (!existing) throw new ShiftNotFoundError(command.shiftId)
    // Cascade first: shift is SOFT-deleted, so its row survives, but an assignment
    // pointing at a removed one is meaningless -- and `FeasibilityGate.eligible` THROWS on a
    // staffId that is no longer in `SchedulingInput.staff`, which turned every later coverage
    // read into a 500 (see the repository interface's note).
    await tx.assignments.deleteByShiftId(command.shiftId)
    await tx.shifts.softDelete(command.shiftId)
  }
}
