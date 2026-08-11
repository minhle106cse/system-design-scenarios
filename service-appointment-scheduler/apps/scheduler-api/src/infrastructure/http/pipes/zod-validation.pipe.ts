import { PipeTransform, BadRequestException } from '@nestjs/common'
import { ZodSchema } from 'zod'

// Per-route pipe (@UsePipes(new ZodValidationPipe(schema))), not global — see
// directives/zod_validation.md. Cortex's server.ts also registers a SECOND,
// global pipe from the `nestjs-zod` package for its DTO-class pattern; that
// package is deliberately not a dependency here (see .ai/plans/init-source.plan.md §8) — one
// validation mechanism, used explicitly per route, is enough for this scope.
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodSchema) {}

  transform(value: unknown) {
    const result = this.schema.safeParse(value)
    if (!result.success) {
      // The keys here are NOT free-form: GlobalExceptionFilter reads `code`
      // (to override the status-derived default) and `message`, and puts
      // `errors` into the response body's `error.details`. This originally
      // sent `errorCode`, which the filter does not look at — the client got
      // `code: "BAD_REQUEST"` and `message: "Internal server error"` for what
      // was really a field-validation failure. Renaming the key is the whole
      // fix; keep the three names aligned with the filter.
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        errors: result.error.flatten().fieldErrors,
      })
    }
    return result.data
  }
}
