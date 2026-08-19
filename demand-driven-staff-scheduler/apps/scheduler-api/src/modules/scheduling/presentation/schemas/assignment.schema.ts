import { z } from 'zod'

export const createAssignmentSchema = z.object({
  staffId: z.string().trim().min(1),
  shiftId: z.string().trim().min(1),
  dayOfWeek: z.coerce.number().int().min(1).max(7), // 1 = Monday .. 7 = Sunday
})
export type CreateAssignmentInput = z.infer<typeof createAssignmentSchema>

/** A move relocates an existing assignment; `staffId` is NOT accepted — the seat keeps its person
 *  (`AssignmentMoveInput`'s docstring explains why reassigning is a different operation). */
export const moveAssignmentSchema = z.object({
  shiftId: z.string().trim().min(1),
  dayOfWeek: z.coerce.number().int().min(1).max(7), // 1 = Monday .. 7 = Sunday
})
export type MoveAssignmentInput = z.infer<typeof moveAssignmentSchema>
