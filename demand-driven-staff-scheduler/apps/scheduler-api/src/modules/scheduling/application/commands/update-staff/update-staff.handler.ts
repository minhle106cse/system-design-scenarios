import { Injectable } from '@nestjs/common'
import type { ITransactionalCommandHandler } from '@scheduler/shared-kernel'
import { CommandHandler } from '@/infrastructure/cqrs/decorators/command-handler.decorator'
import type { SchedulerApiRepos } from '@/infrastructure/cqrs/scheduler-api-repos'
import { StaffMemberNotFoundError } from '@/common/errors/scheduling.error'
import type { StaffMember } from '../../../domain/entities/staff-member.entity'
import { UpdateStaffCommand } from './update-staff.command'

@Injectable()
@CommandHandler(UpdateStaffCommand)
export class UpdateStaffHandler implements ITransactionalCommandHandler<
  UpdateStaffCommand,
  StaffMember,
  SchedulerApiRepos
> {
  readonly kind = 'transactional' as const

  async execute(command: UpdateStaffCommand, tx: SchedulerApiRepos): Promise<StaffMember> {
    const existing = await tx.staff.findById(command.staffId)
    if (!existing) throw new StaffMemberNotFoundError(command.staffId)

    return tx.staff.update(command.staffId, {
      ...(command.staffName !== undefined && { name: command.staffName }),
      ...(command.maxWeeklyHours !== undefined && { maxWeeklyHours: command.maxWeeklyHours }),
    })
  }
}
