import { Injectable } from '@nestjs/common'
import type { ITransactionalCommandHandler } from '@scheduler/shared-kernel'
import { CommandHandler } from '@/infrastructure/cqrs/decorators/command-handler.decorator'
import type { SchedulerApiRepos } from '@/infrastructure/cqrs/scheduler-api-repos'
import { ShiftNotFoundError } from '@/common/errors/scheduling.error'
import type { ShiftRoleRequirement } from '../../../domain/entities/role.entity'
import { SetShiftRoleRequirementsCommand } from './set-shift-role-requirements.command'

/** Replace-the-whole-set, same reasoning as `SetStaffRolesHandler`. */
@Injectable()
@CommandHandler(SetShiftRoleRequirementsCommand)
export class SetShiftRoleRequirementsHandler implements ITransactionalCommandHandler<
  SetShiftRoleRequirementsCommand,
  ShiftRoleRequirement[],
  SchedulerApiRepos
> {
  readonly kind = 'transactional' as const

  async execute(
    command: SetShiftRoleRequirementsCommand,
    tx: SchedulerApiRepos,
  ): Promise<ShiftRoleRequirement[]> {
    const shift = await tx.shifts.findById(command.shiftId)
    if (!shift) throw new ShiftNotFoundError(command.shiftId)

    return tx.shiftRoleRequirements.setForShift(command.shiftId, command.requirements)
  }
}
