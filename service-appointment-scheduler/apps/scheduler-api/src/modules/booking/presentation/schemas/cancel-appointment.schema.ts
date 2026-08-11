import { z } from 'zod'

export const cancelAppointmentParamsSchema = z.object({
  id: z.string().uuid(),
})

export type CancelAppointmentParams = z.infer<typeof cancelAppointmentParamsSchema>
