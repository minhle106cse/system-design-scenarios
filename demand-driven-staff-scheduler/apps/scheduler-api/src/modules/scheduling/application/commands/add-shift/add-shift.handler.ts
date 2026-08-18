import { Injectable } from '@nestjs/common'
import type { ITransactionalCommandHandler } from '@scheduler/shared-kernel'
import { CommandHandler } from '@/infrastructure/cqrs/decorators/command-handler.decorator'
import type { SchedulerApiRepos } from '@/infrastructure/cqrs/scheduler-api-repos'
import { ScheduleNotFoundError } from '@/common/errors/scheduling.error'
import type { Shift } from '../../../domain/entities/shift.entity'
import { AddShiftCommand } from './add-shift.command'

/** Brief §2.4 — add a shift (start time + end time only). */
@Injectable()
@CommandHandler(AddShiftCommand)
export class AddShiftHandler implements ITransactionalCommandHandler<
  AddShiftCommand,
  Shift,
  SchedulerApiRepos
> {
  readonly kind = 'transactional' as const

  async execute(command: AddShiftCommand, tx: SchedulerApiRepos): Promise<Shift> {
    const schedule = await tx.schedules.findById(command.scheduleId)
    if (!schedule) throw new ScheduleNotFoundError(command.scheduleId)

    return tx.shifts.create({
      scheduleId: command.scheduleId,
      label: command.label,
      startMinute: command.startMinute,
      endMinute: command.endMinute,
    })
  }
}
