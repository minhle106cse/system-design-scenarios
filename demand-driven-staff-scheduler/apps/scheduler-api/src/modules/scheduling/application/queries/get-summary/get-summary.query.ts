import type { IQuery } from '@scheduler/shared-kernel'

export class GetSummaryQuery implements IQuery {
  readonly name = GetSummaryQuery.name

  constructor(readonly scheduleId: string) {}
}
