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
      throw new BadRequestException({
        errorCode: 'VALIDATION_ERROR',
        errors: result.error.flatten().fieldErrors,
      })
    }
    return result.data
  }
}
