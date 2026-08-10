import type { IQuery } from '@scheduler/shared-kernel'

export class CheckAvailabilityQuery implements IQuery {
  readonly name = CheckAvailabilityQuery.name

  constructor(
    readonly dealershipId: string,
    readonly serviceTypeId: string,
    /** `YYYY-MM-DD`, interpreted in `BUSINESS_TIMEZONE`. */
    readonly date: string,
  ) {}
}
