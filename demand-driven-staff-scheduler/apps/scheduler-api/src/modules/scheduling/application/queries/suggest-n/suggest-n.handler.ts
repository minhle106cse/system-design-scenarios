import { Inject, Injectable } from '@nestjs/common'
import type { IQueryHandler } from '@scheduler/shared-kernel'
import { suggestTransactionsPerStaff } from '@scheduler/scheduling-core'
import { QueryHandler } from '@/infrastructure/cqrs/decorators/query-handler.decorator'
import {
  InsufficientCalibrationDataError,
  ScheduleNotFoundError,
} from '@/common/errors/scheduling.error'
import { buildSchedulingInput } from '../../shared/build-scheduling-input'
import {
  SCHEDULING_QUERY_REPOSITORY,
  type ISchedulingQueryRepository,
} from '../../repositories/scheduling.query-repository'
import { SuggestNQuery } from './suggest-n.query'

export interface SuggestNResult {
  /** The data-driven `N` — `suggestTransactionsPerStaff` (`docs/01_business_requirements.md`
   *  assumption 1's "Suggest from data"). May legitimately differ from `current` — ADR-0003
   *  documents why the seed schedule ships `N=18` even though the calibration for that exact
   *  dataset returns `15`. The UI must show both, never silently overwrite one with the other. */
  readonly suggested: number
  readonly current: number
}

/** Brief §01 assumption 1 — "Suggest from data" for the `transactionsPerStaffHour` parameter. */
@Injectable()
@QueryHandler(SuggestNQuery)
export class SuggestNHandler implements IQueryHandler<SuggestNQuery, SuggestNResult> {
  constructor(
    @Inject(SCHEDULING_QUERY_REPOSITORY) private readonly repo: ISchedulingQueryRepository,
  ) {}

  async execute(query: SuggestNQuery): Promise<SuggestNResult> {
    const detail = await this.repo.findScheduleDetail(query.scheduleId)
    if (!detail) throw new ScheduleNotFoundError(query.scheduleId)

    const missing = {
      staff: detail.staff.length === 0,
      shifts: detail.shifts.length === 0,
      demand: detail.demandCells.length === 0,
    }
    if (missing.staff || missing.shifts || missing.demand) {
      throw new InsufficientCalibrationDataError(missing)
    }

    const input = buildSchedulingInput({
      schedule: detail.schedule,
      staff: detail.staff,
      shifts: detail.shifts,
      demandCells: detail.demandCells,
      unavailability: detail.unavailability,
    })
    const suggested = suggestTransactionsPerStaff(input.demand, input.staff, input.shifts, {
      minStaffWhenOpen: input.parameters.minStaffWhenOpen,
      ...(input.parameters.maxStaffPerHour !== undefined && {
        maxStaffPerHour: input.parameters.maxStaffPerHour,
      }),
    })

    return { suggested, current: detail.schedule.transactionsPerStaffHour }
  }
}
