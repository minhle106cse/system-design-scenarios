import { Injectable } from '@nestjs/common'
import type { ITransactionalCommandHandler } from '@scheduler/shared-kernel'
import { CommandHandler } from '@/infrastructure/cqrs/decorators/command-handler.decorator'
import type { SchedulerApiRepos } from '@/infrastructure/cqrs/scheduler-api-repos'
import { ScheduleNotFoundError } from '@/common/errors/scheduling.error'
import type { Role } from '../../../domain/entities/role.entity'
import { AddRoleCommand } from './add-role.command'

/** Brief §8 stretch — roles/skills, e.g. "a shift must include at least one supervisor" (D2).
 *  `@@unique([scheduleId, name])`'s raw P2002 -> `DuplicateRoleNameError` translation happens in
 *  `PrismaRoleRepository.create`, not here — application code must not depend on the ORM
 *  (`eslint.config.mjs`'s layer rule), so it cannot catch a `Prisma.PrismaClientKnownRequestError`. */
@Injectable()
@CommandHandler(AddRoleCommand)
export class AddRoleHandler implements ITransactionalCommandHandler<
  AddRoleCommand,
  Role,
  SchedulerApiRepos
> {
  readonly kind = 'transactional' as const

  async execute(command: AddRoleCommand, tx: SchedulerApiRepos): Promise<Role> {
    const schedule = await tx.schedules.findById(command.scheduleId)
    if (!schedule) throw new ScheduleNotFoundError(command.scheduleId)

    return tx.roles.create({ scheduleId: command.scheduleId, name: command.roleName })
  }
}
