import { z } from 'zod'

export const bookAppointmentSchema = z.object({
  customerId: z.string().uuid(),
  vehicleId: z.string().uuid(),
  dealershipId: z.string().uuid(),
  serviceTypeId: z.string().uuid(),
  // `z.iso.datetime({ offset: true })`, not `z.string().datetime()`: the latter
  // defaults to `offset: false` and REJECTS `2026-08-17T17:00:00+07:00` while
  // accepting the identical instant written as `...T10:00:00Z`. Since
  // BUSINESS_TIMEZONE is configurable and the whole model is described in local
  // hours, refusing a client's natural local-offset form was a trap.
  startAt: z.iso
    .datetime({ offset: true })
    // The only temporal rule Zod can own: an appointment cannot start in the
    // past. Evaluated per parse (the closure re-reads the clock on every
    // request), so this is a live check, not a module-load snapshot. Whether the
    // window fits the business day is a different question — it depends on
    // ServiceType.durationMinutes, so it lives in the handler.
    .refine((value) => new Date(value).getTime() > Date.now(), {
      message: 'startAt must be in the future',
    }),
})

export type BookAppointmentBody = z.infer<typeof bookAppointmentSchema>
