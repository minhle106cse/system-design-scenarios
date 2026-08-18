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
    await tx.staff.softDelete(command.staffId)
  }
}
