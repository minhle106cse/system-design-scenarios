import { Inject, Injectable } from '@nestjs/common'
import type { IQueryHandler } from '@scheduler/shared-kernel'
import { QueryHandler } from '@/infrastructure/cqrs/decorators/query-handler.decorator'
import type { Schedule } from '../../../domain/entities/schedule.entity'
import {
  SCHEDULING_QUERY_REPOSITORY,
  type ISchedulingQueryRepository,
} from '../scheduling.query-repository'
import { ListSchedulesQuery } from './list-schedules.query'

/** Brief §2.1 — the "list" half of `/`, the only route above a schedule. */
@Injectable()
@QueryHandler(ListSchedulesQuery)
export class ListSchedulesHandler implements IQueryHandler<
  ListSchedulesQuery,
  readonly Schedule[]
> {
  constructor(
    @Inject(SCHEDULING_QUERY_REPOSITORY) private readonly repo: ISchedulingQueryRepository,
  ) {}

  async execute(): Promise<readonly Schedule[]> {
    return this.repo.findAllSchedules()
  }
}
