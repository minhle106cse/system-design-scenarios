import { Injectable } from '@nestjs/common'
import type { ITransactionalCommandHandler } from '@scheduler/shared-kernel'
import { CommandHandler } from '@/infrastructure/cqrs/decorators/command-handler.decorator'
import type { SchedulerApiRepos } from '@/infrastructure/cqrs/scheduler-api-repos'
import { StaffMemberNotFoundError } from '@/common/errors/scheduling.error'
import type { StaffRole } from '../../../domain/entities/role.entity'
import { SetStaffRolesCommand } from './set-staff-roles.command'

/** Replace-the-whole-set (assumptions 10/11's precedent), matching `IStaffRoleRepository`'s own
 *  docstring — not add/remove-one semantics for what is, from the UI, a multi-select. */
@Injectable()
@CommandHandler(SetStaffRolesCommand)
export class SetStaffRolesHandler implements ITransactionalCommandHandler<
  SetStaffRolesCommand,
  StaffRole[],
  SchedulerApiRepos
> {
  readonly kind = 'transactional' as const

  async execute(command: SetStaffRolesCommand, tx: SchedulerApiRepos): Promise<StaffRole[]> {
    const staff = await tx.staff.findById(command.staffId)
    if (!staff) throw new StaffMemberNotFoundError(command.staffId)

    return tx.staffRoles.setForStaff(command.staffId, command.roleIds)
  }
}
