import { Inject, Injectable } from '@nestjs/common'
import type { IQueryHandler } from '@scheduler/shared-kernel'
import { summarise } from '@scheduler/scheduling-core'
import type {
  DayOfWeek,
  DemandGrid,
  Roster,
  Shift,
  SummaryReport,
} from '@scheduler/scheduling-core'
import { QueryHandler } from '@/infrastructure/cqrs/decorators/query-handler.decorator'
import { ScheduleNotFoundError } from '@/common/errors/scheduling.error'
import {
  SCHEDULING_QUERY_REPOSITORY,
  type ISchedulingQueryRepository,
} from '../../repositories/scheduling.query-repository'
import { GetSummaryQuery } from './get-summary.query'

/** Brief §2.6 — the aggregated summary. `summarise` is deliberately separate from
 *  `generateRoster` (ADR-0004) — this query re-derives it from the persisted roster every time, so
 *  it stays correct after a manual edit (stretch goal), not just right after auto-schedule. */
@Injectable()
@QueryHandler(GetSummaryQuery)
export class GetSummaryHandler implements IQueryHandler<GetSummaryQuery, SummaryReport> {
  constructor(
    @Inject(SCHEDULING_QUERY_REPOSITORY) private readonly repo: ISchedulingQueryRepository,
  ) {}

  async execute(query: GetSummaryQuery): Promise<SummaryReport> {
    const detail = await this.repo.findScheduleDetail(query.scheduleId)
    if (!detail) throw new ScheduleNotFoundError(query.scheduleId)

    const demandBuilder = new Map<DayOfWeek, Map<number, number>>()
    for (const cell of detail.demandCells) {
      const day = cell.dayOfWeek as DayOfWeek
      const dayMap = demandBuilder.get(day) ?? new Map<number, number>()
      dayMap.set(cell.hour, cell.transactions)
      demandBuilder.set(day, dayMap)
    }
    const demand: DemandGrid = demandBuilder

    const shifts: Shift[] = detail.shifts.map((s) => ({
      id: s.id,
      label: s.label,
      startMinute: s.startMinute,
      endMinute: s.endMinute,
    }))
    const roster: Roster = {
      assignments: detail.assignments.map((a) => ({
        staffId: a.staffId,
        shiftId: a.shiftId,
        day: a.dayOfWeek as DayOfWeek,
        source: a.source,
      })),
    }

    return summarise(roster, demand, shifts)
  }
}
