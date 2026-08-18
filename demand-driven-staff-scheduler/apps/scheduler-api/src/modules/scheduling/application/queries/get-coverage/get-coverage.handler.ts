import { Inject, Injectable } from '@nestjs/common'
import type { IQueryHandler } from '@scheduler/shared-kernel'
import {
  computeRequiredStaff,
  computeShiftRequirements,
  buildDiagnostics,
  FeasibilityGate,
  RosterState,
} from '@scheduler/scheduling-core'
import type { DayOfWeek, Diagnostics } from '@scheduler/scheduling-core'
import { QueryHandler } from '@/infrastructure/cqrs/decorators/query-handler.decorator'
import { ScheduleNotFoundError } from '@/common/errors/scheduling.error'
import {
  SCHEDULING_QUERY_REPOSITORY,
  type ISchedulingQueryRepository,
} from '../scheduling.query-repository'
import { buildSchedulingInput } from '../../shared/build-scheduling-input'
import { GetCoverageQuery } from './get-coverage.query'

/**
 * Brief §8 stretch — required vs scheduled per hour (`Diagnostics.hours`), recomputed from the
 * CURRENTLY PERSISTED roster on every call, not read back from the last `ScheduleRun`'s stored
 * snapshot. `docs/04_data_model.md` originally said the opposite ("coverage reads a stored answer
 * instead of recomputing one that might disagree with what the manager saw") — written before
 * manual roster editing existed. Once an edit can happen after the last auto-schedule run
 * (`AddAssignmentHandler`/`RemoveAssignmentHandler`, this session), a stored snapshot goes stale
 * the moment the manager adds or removes one assignment; `GetSummaryHandler` already made this
 * exact call for the summary report ("re-derives it from the persisted roster every time, so it
 * stays correct after a manual edit, not just right after auto-schedule") — coverage is the same
 * kind of read, so it follows the same rule for the same reason. `docs/04`'s comment corrected to
 * match, not left contradicting the code.
 *
 * Rebuilds `RosterState` by replaying persisted assignments through the SAME `FeasibilityGate`
 * `generateRoster`/`validateRoster` use. Every persisted assignment was written through a
 * gate-checked path already (auto-schedule or a validated manual add), so every replay here is
 * expected to succeed; one that doesn't (e.g. a staff member's cap was lowered after the fact) is
 * simply left out of the coverage count rather than surfaced as an error — this is a read, not a
 * validation endpoint.
 */
@Injectable()
@QueryHandler(GetCoverageQuery)
export class GetCoverageHandler implements IQueryHandler<GetCoverageQuery, Diagnostics> {
  constructor(
    @Inject(SCHEDULING_QUERY_REPOSITORY) private readonly repo: ISchedulingQueryRepository,
  ) {}

  async execute(query: GetCoverageQuery): Promise<Diagnostics> {
    const detail = await this.repo.findScheduleDetail(query.scheduleId)
    if (!detail) throw new ScheduleNotFoundError(query.scheduleId)

    const input = buildSchedulingInput(
      detail.schedule,
      detail.staff,
      detail.shifts,
      detail.demandCells,
    )
    const required = computeRequiredStaff(input.demand, input.parameters)
    const requirements = computeShiftRequirements(required, input.shifts)
    const gate = new FeasibilityGate(input)
    const state = new RosterState()
    const shiftById = new Map(input.shifts.map((s) => [s.id, s]))

    for (const a of detail.assignments) {
      const shift = shiftById.get(a.shiftId)
      if (!shift) continue // orphan reference — shouldn't happen given the FK, defensive only
      const verdict = gate.eligible(a.staffId, a.dayOfWeek as DayOfWeek, shift, state)
      if (verdict.ok) state.commit(verdict.eligibility)
    }

    return buildDiagnostics(input, required, requirements, { gate, state })
  }
}
