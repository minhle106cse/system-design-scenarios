import { z } from 'zod'

// Single source of truth for env defaults. Ported from
// ../service-appointment-scheduler/apps/scheduler-api/src/config/env.validation.ts with the
// booking-domain business-hours block dropped entirely — this scenario has no opening-hours
// concept of its own (an hour is "open" iff a demand cell exists for it, init plan §7.2
// assumption 2 — that's data, not env config). Every key here is also listed in .env.example; if
// the two ever drift, .env.example is wrong.
export const envValidationSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(4102),
  CORS_ALLOWED_ORIGINS: z.string().default('http://localhost:3000'),
  SCHEDULER_DATABASE_URL: z.string().url(),
  LOG_LEVEL: z.string().default('info'),
})

export function validate(config: Record<string, unknown>) {
  const result = envValidationSchema.safeParse(config)

  if (!result.success) {
    throw new Error(`Environment variables validation failed: ${result.error.message}`)
  }

  return result.data
}
