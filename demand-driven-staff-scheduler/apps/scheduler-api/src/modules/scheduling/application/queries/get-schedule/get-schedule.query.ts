import type { IQuery } from '@scheduler/shared-kernel'

export class GetScheduleQuery implements IQuery {
  readonly name = GetScheduleQuery.name

  constructor(readonly scheduleId: string) {}
}
