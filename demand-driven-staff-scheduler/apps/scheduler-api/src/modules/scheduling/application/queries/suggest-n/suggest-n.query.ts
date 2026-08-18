import type { IQuery } from '@scheduler/shared-kernel'

export class SuggestNQuery implements IQuery {
  readonly name = SuggestNQuery.name

  constructor(readonly scheduleId: string) {}
}
