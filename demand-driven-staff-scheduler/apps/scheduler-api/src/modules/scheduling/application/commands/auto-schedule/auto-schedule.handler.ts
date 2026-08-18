import { Injectable } from '@nestjs/common'
import type { ITransactionalCommandHandler } from '@scheduler/shared-kernel'
import { generateRoster } from '@scheduler/scheduling-core'
import type { SchedulingResult } from '@scheduler/scheduling-core'
import { CommandHandler } from '@/infrastructure/cqrs/decorators/command-handler.decorator'
import type { SchedulerApiRepos } from '@/infrastructure/cqrs/scheduler-api-repos'
import { ScheduleNotFoundError } from '@/common/errors/scheduling.error'
import { buildSchedulingInput } from '../../shared/build-scheduling-input'
import { AutoScheduleCommand } from './auto-schedule.command'

/**
 * Brief §2.5 — the whole point of the exercise. `generateRoster` from `@scheduler/scheduling-core`
 * IS the business logic (ADR-0004) — this handler's only job is orchestration: load rows, shape
 * them into `SchedulingInput`, call the pure function, persist the result. Full replace
 * (assumption 11) — running this twice on unchanged data yields the same roster, so no
 * idempotency store is needed (backend-architecture-reversal.plan.md §6).
 */
@Injectable()
@CommandHandler(AutoScheduleCommand)
export class AutoScheduleHandler implements ITransactionalCommandHandler<
  AutoScheduleCommand,
  SchedulingResult,
  SchedulerApiRepos
> {
  readonly kind = 'transactional' as const

  async execute(command: AutoScheduleCommand, tx: SchedulerApiRepos): Promise<SchedulingResult> {
    const schedule = await tx.schedules.findById(command.scheduleId)
    if (!schedule) throw new ScheduleNotFoundError(command.scheduleId)

    const [staff, shifts, demandCells, unavailability, staffRoles, shiftRoleRequirements] =
      await Promise.all([
        tx.staff.listByScheduleId(command.scheduleId),
        tx.shifts.listByScheduleId(command.scheduleId),
        tx.demandCells.listByScheduleId(command.scheduleId),
        tx.unavailability.listByScheduleId(command.scheduleId),
        tx.staffRoles.listByScheduleId(command.scheduleId),
        tx.shiftRoleRequirements.listByScheduleId(command.scheduleId),
      ])

    const input = buildSchedulingInput({
      schedule,
      staff,
      shifts,
      demandCells,
      unavailability,
      staffRoles,
      shiftRoleRequirements,
    })

    const result = generateRoster(input)

    await tx.assignments.replaceAll(
      command.scheduleId,
      result.roster.assignments.map((a) => ({
        staffId: a.staffId,
        shiftId: a.shiftId,
        dayOfWeek: a.day,
        source: a.source,
      })),
    )

    await tx.runs.create({
      scheduleId: command.scheduleId,
      parameters: input.parameters,
      diagnostics: result.diagnostics,
    })

    return result
  }
}
