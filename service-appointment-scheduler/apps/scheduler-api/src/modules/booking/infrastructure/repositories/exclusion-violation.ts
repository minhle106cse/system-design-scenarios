/**
 * Detects ADR-0002's exclusion-constraint violation (Postgres `23P01`) and
 * tells the bay-constraint apart from the technician-constraint one.
 *
 * **Verified against a real violation, not assumed** (`docs/adr/0003-availability-and-selection-policy.md`
 * §2.5 flagged this as the one fact that had to be checked, not guessed). Using
 * `@prisma/adapter-pg`, a raw Postgres error the Prisma query engine doesn't
 * have a specific mapping for — which `23P01` is — surfaces as
 * `PrismaClientKnownRequestError` with **`code: 'P2039'`** ("raw database
 * error"), not as `23P01` directly and not as `P2010`. The underlying Postgres
 * error rides along at `error.meta.driverAdapterError.cause`:
 *
 * ```
 * PrismaClientKnownRequestError {
 *   code: 'P2039',
 *   meta: {
 *     modelName: 'Appointment',
 *     driverAdapterError: {
 *       name: 'DriverAdapterError',
 *       cause: {
 *         code: '23P01',
 *         message: 'conflicting key value violates exclusion constraint "appointments_service_bay_no_overlap"',
 *         ...
 *       },
 *     },
 *   },
 * }
 * ```
 *
 * Every field this file reads is duck-typed rather than imported from
 * `@prisma/client`/`@/generated` — same reasoning as
 * `prisma-transient-error.ts`'s `isPrismaKnownRequestError`: importing the
 * Prisma error class here would work, but the shape check already carries
 * enough specificity (`code` + a nested Postgres `23P01` + `clientVersion`)
 * that nothing else realistically matches it, and it keeps this module
 * independent of exactly which Prisma import path the caller used.
 */

interface DriverAdapterCause {
  readonly code?: unknown
  readonly message?: unknown
}

interface PrismaRawDatabaseError {
  readonly code: 'P2039'
  readonly clientVersion: string
  readonly meta?: {
    readonly driverAdapterError?: {
      readonly cause?: DriverAdapterCause
    }
  }
}

function asPrismaRawDatabaseError(error: unknown): PrismaRawDatabaseError | undefined {
  if (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === 'P2039' &&
    typeof (error as { clientVersion?: unknown }).clientVersion === 'string'
  ) {
    return error as PrismaRawDatabaseError
  }
  return undefined
}

/** Which of ADR-0002's two constraints fired, or `undefined` for an unrelated `23P01`. */
export type ExclusionConstraint = 'service_bay' | 'technician'

/**
 * `undefined` when `error` is not this exclusion violation at all — a caller
 * must not assume every thrown error here is booking-related; `P2039` is
 * Postgres's catch-all for any raw error the engine has no specific code for.
 */
export function detectExclusionViolation(error: unknown): ExclusionConstraint | undefined {
  const cause = asPrismaRawDatabaseError(error)?.meta?.driverAdapterError?.cause
  if (!cause || cause.code !== '23P01') return undefined

  const message = typeof cause.message === 'string' ? cause.message : ''
  if (message.includes('appointments_service_bay_no_overlap')) return 'service_bay'
  if (message.includes('appointments_technician_no_overlap')) return 'technician'

  // 23P01 with neither constraint name means a THIRD exclusion constraint was
  // added to this table since this file was written — fail loudly rather than
  // silently mis-attributing it to one of the two known ones.
  return undefined
}
