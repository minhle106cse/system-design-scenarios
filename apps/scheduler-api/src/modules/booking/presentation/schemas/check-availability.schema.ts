import { z } from 'zod'

export const checkAvailabilityQuerySchema = z.object({
  dealershipId: z.string().uuid(),
  serviceTypeId: z.string().uuid(),
  // `YYYY-MM-DD` — a plain calendar day, interpreted in BUSINESS_TIMEZONE.
  // See docs/06_api_contracts.md for why `date` is the only window form
  // (an earlier draft offered "date OR startAt/endAt" and never resolved it).
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD'),
})

export type CheckAvailabilityQueryParams = z.infer<typeof checkAvailabilityQuerySchema>
