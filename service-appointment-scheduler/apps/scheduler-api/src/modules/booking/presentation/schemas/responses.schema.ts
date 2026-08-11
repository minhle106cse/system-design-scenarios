import { z } from 'zod'
import { createSuccessResponseSchema, ErrorResponseSchema } from '@scheduler/shared-kernel'
import type { AppointmentSummaryDto } from '../../application/commands/appointment-summary.dto'
import type { AvailabilityDto } from '../../application/queries/booking.dto'

/**
 * Zod descriptions of what actually goes over the wire, used ONLY to generate
 * OpenAPI schemas (`z.toJSONSchema`, zod 4 native — no `nestjs-zod`, no DTO
 * classes, no extra dependency).
 *
 * Why they exist at all: the response DTOs are TypeScript `interface`s, which
 * are erased at compile time, so `emitDecoratorMetadata` sees `Object` and the
 * spec ended up with `description` strings and no `content` block at all. The
 * brief names an OpenAPI spec as a legitimate way to stub the client layer, so
 * "documented in Markdown but not in the spec" was not good enough.
 *
 * Why the envelope is wrapped: `ResponseInterceptor` wraps every handler return
 * value in `buildSuccessBody`, so the shape a client receives is
 * `{ success, data, message, meta }` — declaring the bare DTO would document a
 * body that never appears on the wire. `createSuccessResponseSchema` is reused
 * from shared-kernel rather than re-describing the envelope here, so a change to
 * the envelope updates the spec automatically.
 */

const appointmentSummarySchema = z.object({
  id: z.string().uuid(),
  status: z.enum(['SCHEDULED', 'CANCELLED', 'COMPLETED']),
  startAt: z.iso.datetime(),
  endAt: z.iso.datetime(),
  serviceBay: z.object({ id: z.string().uuid(), label: z.string() }),
  technician: z.object({ id: z.string().uuid(), name: z.string() }),
})

const availabilitySchema = z.object({
  date: z.string(),
  serviceTypeId: z.string().uuid(),
  durationMinutes: z.number().int().positive(),
  availableSlots: z.array(
    z.object({
      startAt: z.iso.datetime(),
      endAt: z.iso.datetime(),
      availableBays: z.number().int().nonnegative(),
      availableTechnicians: z.number().int().nonnegative(),
    }),
  ),
})

/**
 * Compile-time guards that the documentation cannot drift from the contract.
 *
 * These are the whole reason it is safe to describe the response twice. If a
 * field is added to a DTO and not to the schema above (or the types stop
 * matching), the build fails here rather than the spec quietly going stale —
 * which is exactly the failure mode this file exists to fix.
 */
type _AppointmentSummaryMatches =
  z.infer<typeof appointmentSummarySchema> extends AppointmentSummaryDto
    ? AppointmentSummaryDto extends z.infer<typeof appointmentSummarySchema>
      ? true
      : never
    : never
type _AvailabilityMatches =
  z.infer<typeof availabilitySchema> extends AvailabilityDto
    ? AvailabilityDto extends z.infer<typeof availabilitySchema>
      ? true
      : never
    : never
const _appointmentSummaryContract: _AppointmentSummaryMatches = true
const _availabilityContract: _AvailabilityMatches = true
void _appointmentSummaryContract
void _availabilityContract

/** `z.toJSONSchema` returns a JSON Schema object; `@nestjs/swagger`'s `schema` accepts one. */
function toOpenApiSchema(schema: z.ZodType): Record<string, unknown> {
  return z.toJSONSchema(schema)
}

export const appointmentResponseSchema = toOpenApiSchema(
  createSuccessResponseSchema(appointmentSummarySchema),
)

export const availabilityResponseSchema = toOpenApiSchema(
  createSuccessResponseSchema(availabilitySchema),
)

export const errorResponseSchema = toOpenApiSchema(ErrorResponseSchema)

export { toOpenApiSchema }
