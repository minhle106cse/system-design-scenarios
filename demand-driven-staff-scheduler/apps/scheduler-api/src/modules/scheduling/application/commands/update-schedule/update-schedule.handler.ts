import { Injectable } from '@nestjs/common'
import type { ITransactionalCommandHandler } from '@scheduler/shared-kernel'
import { CommandHandler } from '@/infrastructure/cqrs/decorators/command-handler.decorator'
import type { SchedulerApiRepos } from '@/infrastructure/cqrs/scheduler-api-repos'
import { ScheduleNotFoundError } from '@/common/errors/scheduling.error'
import type { Schedule } from '../../../domain/entities/schedule.entity'
import { UpdateScheduleCommand } from './update-schedule.command'

/**
 * A3 — the parameter panel (`docs/05_ui_guidelines.md`'s Roster screen): the four fields
 * `AutoScheduleHandler` reads off `Schedule` (`transactionsPerStaffHour`, `minStaffWhenOpen`,
 * `maxStaffPerHour`, `minUtilisationTarget`) plus `name`. All independent scalar fields — no
 * cross-field re-check the way `UpdateShiftHandler`'s merged-state check needs.
 */
@Injectable()
@CommandHandler(UpdateScheduleCommand)
export class UpdateScheduleHandler implements ITransactionalCommandHandler<
  UpdateScheduleCommand,
  Schedule,
  SchedulerApiRepos
> {
  readonly kind = 'transactional' as const

  async execute(command: UpdateScheduleCommand, tx: SchedulerApiRepos): Promise<Schedule> {
    const existing = await tx.schedules.findById(command.scheduleId)
    if (!existing) throw new ScheduleNotFoundError(command.scheduleId)
    return tx.schedules.update(command.scheduleId, command.data)
  }
}
