import { z } from 'zod'

export const createScheduleSchema = z.object({
  name: z.string().trim().min(1),
})
export type CreateScheduleInput = z.infer<typeof createScheduleSchema>
