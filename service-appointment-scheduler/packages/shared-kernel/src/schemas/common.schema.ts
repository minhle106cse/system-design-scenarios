import { z } from 'zod'

// Common Meta
export const MetaSchema = z.object({
  requestId: z.string(),
  timestamp: z.string().datetime(),
  version: z.string(),
})

// Standard Error Response
export const ErrorResponseSchema = z.object({
  success: z.literal(false),
  message: z.string().optional(),
  error: z.object({
    code: z.string(),
    details: z.any().optional(),
  }),
  meta: MetaSchema.optional(),
})

// Standard Success Response Wrapper
export const createSuccessResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) => {
  return z.object({
    success: z.literal(true),
    message: z.string().optional(),
    data: dataSchema,
    meta: MetaSchema.optional(),
  })
}

// Pagination
export const PaginationQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(10),
})

// NOTE: Cortex's JwtPayloadSchema is deliberately not ported — this repo
// models no auth/RBAC (see .ai/plans/init-source.plan.md §3.2). Re-add it here the moment a
// JWT-bearing endpoint exists.
