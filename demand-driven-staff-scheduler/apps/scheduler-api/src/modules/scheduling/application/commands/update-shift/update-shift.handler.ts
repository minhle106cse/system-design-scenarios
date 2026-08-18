import { Injectable } from '@nestjs/common'
import type { ITransactionalCommandHandler } from '@scheduler/shared-kernel'
import { CommandHandler } from '@/infrastructure/cqrs/decorators/command-handler.decorator'
import type { SchedulerApiRepos } from '@/infrastructure/cqrs/scheduler-api-repos'
import { ShiftNotFoundError, InvalidShiftTimeRangeError } from '@/common/errors/scheduling.error'
import type { Shift } from '../../../domain/entities/shift.entity'
import { UpdateShiftCommand } from './update-shift.command'

@Injectable()
@CommandHandler(UpdateShiftCommand)
export class UpdateShiftHandler implements ITransactionalCommandHandler<
  UpdateShiftCommand,
  Shift,
  SchedulerApiRepos
> {
  readonly kind = 'transactional' as const

  async execute(command: UpdateShiftCommand, tx: SchedulerApiRepos): Promise<Shift> {
    const existing = await tx.shifts.findById(command.shiftId)
    if (!existing) throw new ShiftNotFoundError(command.shiftId)

    const startMinute = command.startMinute ?? existing.startMinute
    const endMinute = command.endMinute ?? existing.endMinute
    // Merged-state check — see InvalidShiftTimeRangeError's docstring for why this can't be Zod's job.
    if (endMinute <= startMinute) throw new InvalidShiftTimeRangeError(startMinute, endMinute)

    return tx.shifts.update(command.shiftId, {
      ...(command.label !== undefined && { label: command.label }),
      ...(command.startMinute !== undefined && { startMinute: command.startMinute }),
      ...(command.endMinute !== undefined && { endMinute: command.endMinute }),
    })
  }
}
