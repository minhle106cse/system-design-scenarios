import { Injectable } from '@nestjs/common'
import type { ITransactionalCommandHandler } from '@scheduler/shared-kernel'
import { CommandHandler } from '@/infrastructure/cqrs/decorators/command-handler.decorator'
import type { SchedulerApiRepos } from '@/infrastructure/cqrs/scheduler-api-repos'
import { ScheduleNotFoundError } from '@/common/errors/scheduling.error'
import type { StaffMember } from '../../../domain/entities/staff-member.entity'
import { AddStaffCommand } from './add-staff.command'

/** Brief §2.2 — add a staff member + their weekly-hours cap. */
@Injectable()
@CommandHandler(AddStaffCommand)
export class AddStaffHandler implements ITransactionalCommandHandler<
  AddStaffCommand,
  StaffMember,
  SchedulerApiRepos
> {
  readonly kind = 'transactional' as const

  async execute(command: AddStaffCommand, tx: SchedulerApiRepos): Promise<StaffMember> {
    const schedule = await tx.schedules.findById(command.scheduleId)
    if (!schedule) throw new ScheduleNotFoundError(command.scheduleId)

    return tx.staff.create({
      scheduleId: command.scheduleId,
      name: command.staffName,
      maxWeeklyHours: command.maxWeeklyHours,
    })
  }
}
