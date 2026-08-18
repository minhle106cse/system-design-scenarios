import { z } from 'zod'

export const createStaffSchema = z.object({
  name: z.string().trim().min(1),
  maxWeeklyHours: z.coerce.number().positive().max(168),
})
export type CreateStaffInput = z.infer<typeof createStaffSchema>

export const updateStaffSchema = z.object({
  name: z.string().trim().min(1).optional(),
  maxWeeklyHours: z.coerce.number().positive().max(168).optional(),
})
export type UpdateStaffInput = z.infer<typeof updateStaffSchema>
