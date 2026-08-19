import { Injectable } from '@nestjs/common'
import type { ITransactionalCommandHandler } from '@scheduler/shared-kernel'
import { validateRoster } from '@scheduler/scheduling-core'
import type { Roster, Assignment as CoreAssignment, DayOfWeek } from '@scheduler/scheduling-core'
import { CommandHandler } from '@/infrastructure/cqrs/decorators/command-handler.decorator'
import type { SchedulerApiRepos } from '@/infrastructure/cqrs/scheduler-api-repos'
import {
  AssignmentNotFoundError,
  ScheduleNotFoundError,
  RosterViolationError,
} from '@/common/errors/scheduling.error'
import { buildSchedulingInput } from '../../shared/build-scheduling-input'
import type { Assignment } from '../../../domain/entities/assignment.entity'
import { MoveAssignmentCommand } from './move-assignment.command'

/**
 * Relocate one existing assignment to another (day, shift) — the write behind the roster grid's
 * drag-and-drop (brief §8's first stretch goal).
 *
 * ⚠️ **This exists because add-then-remove is not a move.** The UI originally implemented a drag
 * as `addAssignment(destination)` followed by `removeAssignment(source)`, ordered that way so a
 * rejected add would leave the original in place. But `AddAssignmentHandler` validates the
 * candidate against a roster that STILL CONTAINS the source assignment, so H1 sees the person's
 * hours going up by a whole shift rather than staying flat: anyone whose remaining slack is
 * smaller than one shift could never be moved at all. That is not a rare corner — the seeded
 * roster leaves four of twelve staff at exactly 100% utilisation, and a fully-loaded team leaves
 * every one of them unmovable. The bug was invisible to the test suite because both endpoints it
 * called were individually correct.
 *
 * The fix is to make the move ONE operation whose validation sees the post-move roster: the
 * source assignment is excluded and the relocated one appended in its place, then the whole thing
 * replayed through the SAME `FeasibilityGate` (`validateRoster`, assumption 12) that
 * auto-schedule and `AddAssignmentHandler` use. A move that keeps a person's weekly hours flat is
 * now correctly seen as keeping them flat — while a move onto a day they already work, or into an
 * overlapping shift, or into an unavailability window, is still rejected exactly as before.
 *
 * Only the MOVED assignment's own violation is acted on, the same rule `AddAssignmentHandler`
 * follows: a pre-existing assignment reporting a violation on replay (e.g. someone's cap was
 * lowered after auto-schedule ran) is a different, pre-existing problem this endpoint doesn't own.
 */
@Injectable()
@CommandHandler(MoveAssignmentCommand)
export class MoveAssignmentHandler implements ITransactionalCommandHandler<
  MoveAssignmentCommand,
  Assignment,
  SchedulerApiRepos
> {
  readonly kind = 'transactional' as const

  async execute(command: MoveAssignmentCommand, tx: SchedulerApiRepos): Promise<Assignment> {
    const schedule = await tx.schedules.findById(command.scheduleId)
    if (!schedule) throw new ScheduleNotFoundError(command.scheduleId)

    const moving = await tx.assignments.findById(command.assignmentId)
    if (!moving || moving.scheduleId !== command.scheduleId) {
      throw new AssignmentNotFoundError(command.assignmentId)
    }

    const [staff, shifts, demandCells, existing, unavailability] = await Promise.all([
      tx.staff.listByScheduleId(command.scheduleId),
      tx.shifts.listByScheduleId(command.scheduleId),
      tx.demandCells.listByScheduleId(command.scheduleId),
      tx.assignments.listByScheduleId(command.scheduleId),
      tx.unavailability.listByScheduleId(command.scheduleId),
    ])

    const input = buildSchedulingInput({ schedule, staff, shifts, demandCells, unavailability })

    // The relocated seat, same person, appended LAST so `validateRoster` attributes any violation
    // it causes to this candidate rather than to whichever assignment happened to be replayed
    // first.
    const candidate: CoreAssignment = {
      staffId: moving.staffId,
      shiftId: command.shiftId,
      day: command.dayOfWeek,
      source: 'MANUAL',
    }
    const candidateRoster: Roster = {
      assignments: [
        ...existing
          .filter((a) => a.id !== command.assignmentId) // ← the whole point: the source is GONE
          .map((a) => ({
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

    return tx.assignments.move(command.assignmentId, {
      shiftId: command.shiftId,
      dayOfWeek: command.dayOfWeek,
    })
  }
}
