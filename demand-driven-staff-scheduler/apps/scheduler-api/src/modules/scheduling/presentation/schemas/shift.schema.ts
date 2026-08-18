import { z } from 'zod'

// endMinute > startMinute rejected here, not in scheduling-core (assumption 3, no overnight
// shifts) — docs/04_data_model.md: "rejected by the Zod schema on every write path."
const timeRangeRefinement = <T extends { startMinute?: number; endMinute?: number }>(data: T) =>
  data.startMinute === undefined ||
  data.endMinute === undefined ||
  data.endMinute > data.startMinute

export const createShiftSchema = z
  .object({
    label: z.string().trim().min(1),
    startMinute: z.coerce.number().int().min(0).max(1439),
    endMinute: z.coerce.number().int().min(1).max(1440),
  })
  .refine(timeRangeRefinement, {
    message: 'endMinute must be greater than startMinute (no overnight shifts)',
    path: ['endMinute'],
  })
export type CreateShiftInput = z.infer<typeof createShiftSchema>

export const updateShiftSchema = z
  .object({
    label: z.string().trim().min(1).optional(),
    startMinute: z.coerce.number().int().min(0).max(1439).optional(),
    endMinute: z.coerce.number().int().min(1).max(1440).optional(),
  })
  .refine(timeRangeRefinement, {
    message: 'endMinute must be greater than startMinute (no overnight shifts)',
    path: ['endMinute'],
  })
export type UpdateShiftInput = z.infer<typeof updateShiftSchema>
