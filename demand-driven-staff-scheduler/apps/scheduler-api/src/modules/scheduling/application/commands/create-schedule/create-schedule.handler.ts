import { Injectable } from '@nestjs/common'
import type { ITransactionalCommandHandler } from '@scheduler/shared-kernel'
import { CommandHandler } from '@/infrastructure/cqrs/decorators/command-handler.decorator'
import type { SchedulerApiRepos } from '@/infrastructure/cqrs/scheduler-api-repos'
import type { Schedule } from '../../../domain/entities/schedule.entity'
import { CreateScheduleCommand } from './create-schedule.command'

/** Brief §2.1 — the top-level container. Seeds the two default shifts (brief §2.4). */
@Injectable()
@CommandHandler(CreateScheduleCommand)
export class CreateScheduleHandler implements ITransactionalCommandHandler<
  CreateScheduleCommand,
  Schedule,
  SchedulerApiRepos
> {
  readonly kind = 'transactional' as const

  async execute(command: CreateScheduleCommand, tx: SchedulerApiRepos): Promise<Schedule> {
    return tx.schedules.create({ name: command.scheduleName })
  }
}
