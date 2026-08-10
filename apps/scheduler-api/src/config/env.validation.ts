import { z } from 'zod'

// Single source of truth for env defaults. Kept deliberately small — this is
// a single service with no message broker, no gRPC, no auth (see
// .ai/plans/init-source.plan.md §0/§2.7). Every key here is one also listed in
// .env.example; if the two ever drift, .env.example is wrong (see
// .ai/plans/init-source.plan.md §11 gotcha 5).
export const envValidationSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(4002),
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
