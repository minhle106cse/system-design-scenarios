import { z } from 'zod'

/**
 * Its own file rather than a reuse of `cancelAppointmentParamsSchema`, per
 * `directives/zod_validation.md` §2: one schema per route, named for the route
 * it validates. They are structurally identical today; sharing the cancel
 * schema would make a later change to either route's params a change to both.
 */
export const getAppointmentParamsSchema = z.object({
  id: z.string().uuid(),
})

export type GetAppointmentParams = z.infer<typeof getAppointmentParamsSchema>
