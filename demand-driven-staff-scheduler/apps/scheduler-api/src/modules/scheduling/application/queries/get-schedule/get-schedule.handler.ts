import { Inject, Injectable } from '@nestjs/common'
import type { IQueryHandler } from '@scheduler/shared-kernel'
import { QueryHandler } from '@/infrastructure/cqrs/decorators/query-handler.decorator'
import { ScheduleNotFoundError } from '@/common/errors/scheduling.error'
import {
  SCHEDULING_QUERY_REPOSITORY,
  type ISchedulingQueryRepository,
  type ScheduleDetail,
} from '../../repositories/scheduling.query-repository'
import { GetScheduleQuery } from './get-schedule.query'

/** Brief §2.1–2.5's read-back — the whole schedule (staff, shifts, demand, roster, latest run). */
@Injectable()
@QueryHandler(GetScheduleQuery)
export class GetScheduleHandler implements IQueryHandler<GetScheduleQuery, ScheduleDetail> {
  constructor(
    @Inject(SCHEDULING_QUERY_REPOSITORY) private readonly repo: ISchedulingQueryRepository,
  ) {}

  async execute(query: GetScheduleQuery): Promise<ScheduleDetail> {
    const detail = await this.repo.findScheduleDetail(query.scheduleId)
    if (!detail) throw new ScheduleNotFoundError(query.scheduleId)
    return detail
  }
}
