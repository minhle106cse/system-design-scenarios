import { Injectable } from '@nestjs/common'
import type { ITransactionalCommandHandler } from '@scheduler/shared-kernel'
import { CommandHandler } from '@/infrastructure/cqrs/decorators/command-handler.decorator'
import type { SchedulerApiRepos } from '@/infrastructure/cqrs/scheduler-api-repos'
import { RoleNotFoundError } from '@/common/errors/scheduling.error'
import { RemoveRoleCommand } from './remove-role.command'

/** Hard delete — no `deletedAt` column (schema.prisma); cascades to `StaffRole`/
 *  `ShiftRoleRequirement` via the FK, so a removed role stops being required or held everywhere
 *  in one write, never leaves an orphaned join row a later read has to defensively skip. */
@Injectable()
@CommandHandler(RemoveRoleCommand)
export class RemoveRoleHandler implements ITransactionalCommandHandler<
  RemoveRoleCommand,
  void,
  SchedulerApiRepos
> {
  readonly kind = 'transactional' as const

  async execute(command: RemoveRoleCommand, tx: SchedulerApiRepos): Promise<void> {
    const existing = await tx.roles.findById(command.roleId)
    if (!existing) throw new RoleNotFoundError(command.roleId)
    await tx.roles.delete(command.roleId)
  }
}
