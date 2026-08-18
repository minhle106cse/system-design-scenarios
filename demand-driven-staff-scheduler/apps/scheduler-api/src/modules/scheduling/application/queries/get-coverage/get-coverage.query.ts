import type { IQuery } from '@scheduler/shared-kernel'

export class GetCoverageQuery implements IQuery {
  readonly name = GetCoverageQuery.name

  constructor(readonly scheduleId: string) {}
}
