import { Injectable } from '@nestjs/common'
import type { ITransactionalCommandHandler } from '@scheduler/shared-kernel'
import { CommandHandler } from '@/infrastructure/cqrs/decorators/command-handler.decorator'
import type { SchedulerApiRepos } from '@/infrastructure/cqrs/scheduler-api-repos'
import { StaffMemberNotFoundError } from '@/common/errors/scheduling.error'
import type { StaffUnavailability } from '../../../domain/entities/staff-unavailability.entity'
import { AddUnavailabilityCommand } from './add-unavailability.command'

/** Stretch goal (brief §8) — per-staff availability/days-off (H4, stretch-goals plan §1b). A "day
 *  off" is just {startMinute: 0, endMinute: 1440} written from the UI's preset, not a separate flag. */
@Injectable()
@CommandHandler(AddUnavailabilityCommand)
export class AddUnavailabilityHandler implements ITransactionalCommandHandler<
  AddUnavailabilityCommand,
  StaffUnavailability,
  SchedulerApiRepos
> {
  readonly kind = 'transactional' as const

  async execute(
    command: AddUnavailabilityCommand,
    tx: SchedulerApiRepos,
  ): Promise<StaffUnavailability> {
    const staff = await tx.staff.findById(command.staffId)
    if (!staff) throw new StaffMemberNotFoundError(command.staffId)

    return tx.unavailability.create({
      staffId: command.staffId,
      dayOfWeek: command.dayOfWeek,
      startMinute: command.startMinute,
      endMinute: command.endMinute,
    })
  }
}
