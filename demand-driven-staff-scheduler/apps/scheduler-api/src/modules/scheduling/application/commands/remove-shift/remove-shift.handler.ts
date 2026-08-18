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
    await tx.shifts.softDelete(command.shiftId)
  }
}
