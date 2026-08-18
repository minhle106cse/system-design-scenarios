import { z } from 'zod'

// Same rule as shift.schema.ts's timeRangeRefinement — endMinute > startMinute, no overnight
// blocks (assumption 3). A "day off" preset is just {startMinute: 0, endMinute: 1440} from the UI.
const timeRangeRefinement = <T extends { startMinute: number; endMinute: number }>(data: T) =>
  data.endMinute > data.startMinute

export const createUnavailabilitySchema = z
  .object({
    dayOfWeek: z.coerce.number().int().min(1).max(7),
    startMinute: z.coerce.number().int().min(0).max(1439),
    endMinute: z.coerce.number().int().min(1).max(1440),
  })
  .refine(timeRangeRefinement, {
    message: 'endMinute must be greater than startMinute (no overnight blocks)',
    path: ['endMinute'],
  })
export type CreateUnavailabilityInput = z.infer<typeof createUnavailabilitySchema>
