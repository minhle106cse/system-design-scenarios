import { Injectable } from '@nestjs/common'
import type { ITransactionalCommandHandler } from '@scheduler/shared-kernel'
import { CommandHandler } from '@/infrastructure/cqrs/decorators/command-handler.decorator'
import type { SchedulerApiRepos } from '@/infrastructure/cqrs/scheduler-api-repos'
import { RoleNotFoundError } from '@/common/errors/scheduling.error'
import type { Role } from '../../../domain/entities/role.entity'
import { UpdateRoleCommand } from './update-role.command'

@Injectable()
@CommandHandler(UpdateRoleCommand)
export class UpdateRoleHandler implements ITransactionalCommandHandler<
  UpdateRoleCommand,
  Role,
  SchedulerApiRepos
> {
  readonly kind = 'transactional' as const

  async execute(command: UpdateRoleCommand, tx: SchedulerApiRepos): Promise<Role> {
    const existing = await tx.roles.findById(command.roleId)
    if (!existing) throw new RoleNotFoundError(command.roleId)

    return tx.roles.update(command.roleId, { name: command.roleName })
  }
}
