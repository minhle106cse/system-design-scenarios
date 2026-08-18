import { z } from 'zod'

export const createAssignmentSchema = z.object({
  staffId: z.string().trim().min(1),
  shiftId: z.string().trim().min(1),
  dayOfWeek: z.coerce.number().int().min(1).max(7), // 1 = Monday .. 7 = Sunday
})
export type CreateAssignmentInput = z.infer<typeof createAssignmentSchema>
