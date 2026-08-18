import { Injectable } from '@nestjs/common'
import type { ITransactionalCommandHandler } from '@scheduler/shared-kernel'
import { validateRoster } from '@scheduler/scheduling-core'
import type { Roster, Assignment as CoreAssignment, DayOfWeek } from '@scheduler/scheduling-core'
import { CommandHandler } from '@/infrastructure/cqrs/decorators/command-handler.decorator'
import type { SchedulerApiRepos } from '@/infrastructure/cqrs/scheduler-api-repos'
import { ScheduleNotFoundError, RosterViolationError } from '@/common/errors/scheduling.error'
import { buildSchedulingInput } from '../../shared/build-scheduling-input'
import type { Assignment } from '../../../domain/entities/assignment.entity'
import { AddAssignmentCommand } from './add-assignment.command'

/**
 * Brief's manual-roster-edit stretch goal. Replays the WHOLE roster (existing assignments + this
 * candidate, appended last) through `validateRoster` — the same `FeasibilityGate` `generateRoster`
 * uses, `assumption 12` (`directives/domain_modeling.md` §2): the auto-schedule path and the
 * manual-edit path share one set of rules, so a manual add can never create a state auto-schedule
 * itself would refuse to produce. Only the CANDIDATE's own violation (if any) is acted on — a
 * pre-existing assignment reporting a violation on replay (e.g. a staff member's cap was lowered
 * after they were auto-scheduled) is a different, pre-existing problem this endpoint doesn't own.
 */
@Injectable()
@CommandHandler(AddAssignmentCommand)
export class AddAssignmentHandler implements ITransactionalCommandHandler<
  AddAssignmentCommand,
  Assignment,
  SchedulerApiRepos
> {
  readonly kind = 'transactional' as const

  async execute(command: AddAssignmentCommand, tx: SchedulerApiRepos): Promise<Assignment> {
    const schedule = await tx.schedules.findById(command.scheduleId)
    if (!schedule) throw new ScheduleNotFoundError(command.scheduleId)

    const [staff, shifts, demandCells, existing, unavailability] = await Promise.all([
      tx.staff.listByScheduleId(command.scheduleId),
      tx.shifts.listByScheduleId(command.scheduleId),
      tx.demandCells.listByScheduleId(command.scheduleId),
      tx.assignments.listByScheduleId(command.scheduleId),
      tx.unavailability.listByScheduleId(command.scheduleId),
    ])

    const input = buildSchedulingInput({ schedule, staff, shifts, demandCells, unavailability })

    const candidate: CoreAssignment = {
      staffId: command.staffId,
      shiftId: command.shiftId,
      day: command.dayOfWeek,
      source: 'MANUAL',
    }
    const candidateRoster: Roster = {
      assignments: [
        ...existing.map((a) => ({
          staffId: a.staffId,
          shiftId: a.shiftId,
          day: a.dayOfWeek as DayOfWeek,
          source: a.source,
        })),
        candidate,
      ],
    }

    const violations = validateRoster(candidateRoster, input)
    const ownViolation = violations.find(
      (v) =>
        v.staffId === candidate.staffId &&
        v.shiftId === candidate.shiftId &&
        v.day === candidate.day,
    )
    if (ownViolation) throw new RosterViolationError([ownViolation])

    return tx.assignments.create(command.scheduleId, {
      staffId: command.staffId,
      shiftId: command.shiftId,
      dayOfWeek: command.dayOfWeek,
      source: 'MANUAL',
    })
  }
}
