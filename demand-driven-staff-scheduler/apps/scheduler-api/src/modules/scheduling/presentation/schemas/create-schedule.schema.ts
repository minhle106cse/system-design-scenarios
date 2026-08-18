import { z } from 'zod'

export const createScheduleSchema = z.object({
  name: z.string().trim().min(1),
})
export type CreateScheduleInput = z.infer<typeof createScheduleSchema>

// A3 — the parameter panel (docs/05_ui_guidelines.md's Roster screen). All optional: a manager
// tunes one field at a time, never resubmits the whole schedule.
export const updateScheduleSchema = z.object({
  name: z.string().trim().min(1).optional(),
  transactionsPerStaffHour: z.coerce.number().positive().optional(),
  minStaffWhenOpen: z.coerce.number().int().min(0).optional(),
  maxStaffPerHour: z.coerce.number().int().min(1).nullable().optional(),
  minUtilisationTarget: z.coerce.number().min(0).max(1).optional(),
})
export type UpdateScheduleInput = z.infer<typeof updateScheduleSchema>
