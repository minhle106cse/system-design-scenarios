import { z } from 'zod'

// Single source of truth for env defaults. Kept deliberately small — this is
// a single service with no message broker, no gRPC, no auth (see
// .ai/plans/init-source.plan.md §0/§2.7). Every key here is one also listed in
// .env.example; if the two ever drift, .env.example is wrong (see
// .ai/plans/init-source.plan.md §11 gotcha 5).
// `HH:mm`, 24-hour. Not `z.string().time()` — that wants seconds too.
const businessTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'must be HH:mm (24-hour)')

/** `1,2,3,4,5` → `[1,2,3,4,5]`. ISO-8601 weekday numbering: 1 = Monday … 7 = Sunday. */
const businessDays = z
  .string()
  .default('1,2,3,4,5')
  .transform((raw) =>
    raw
      .split(',')
      .map((part) => part.trim())
      .filter((part) => part.length > 0)
      .map(Number),
  )
  .refine(
    (days) => days.length > 0 && days.every((day) => Number.isInteger(day) && day >= 1 && day <= 7),
    { message: 'BUSINESS_DAYS must be a comma-separated list of ISO weekdays (1=Mon … 7=Sun)' },
  )

/** `2026-12-25,2027-01-01` → `['2026-12-25','2027-01-01']`. Empty string → `[]`. */
const closedDates = z
  .string()
  .default('')
  .transform((raw) =>
    raw
      .split(',')
      .map((part) => part.trim())
      .filter((part) => part.length > 0),
  )
  .refine((dates) => dates.every((date) => /^\d{4}-\d{2}-\d{2}$/.test(date)), {
    message: 'BUSINESS_CLOSED_DATES must be a comma-separated list of YYYY-MM-DD dates',
  })

export const envValidationSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.coerce.number().default(4002),
    CORS_ALLOWED_ORIGINS: z.string().default('http://localhost:3000'),
    SCHEDULER_DATABASE_URL: z.string().url(),
    LOG_LEVEL: z.string().default('info'),

    // Business hours — configuration rather than a DealershipOpeningHours table,
    // deliberately: see docs/adr/0003-availability-and-selection-policy.md §2.3
    // for why, and docs/01_business_requirements.md § Assumptions for the
    // simplification this buys (ONE schedule for every dealership).
    BUSINESS_HOURS_START: businessTime.default('08:00'),
    BUSINESS_HOURS_END: businessTime.default('18:00'),
    // IANA zone the two times above are expressed in.
    BUSINESS_TIMEZONE: z.string().default('UTC'),
    // Step between candidate start times offered by GET /availability. It does
    // NOT constrain duration — that still comes from ServiceType.durationMinutes.
    SLOT_GRANULARITY_MINUTES: z.coerce
      .number()
      .int()
      .positive()
      .max(24 * 60)
      .default(30),
    // Which weekdays the dealership opens at all. Without this the service was
    // open 365 days a year including Christmas, and the documented cURL example
    // in docs/06_api_contracts.md happened to book a Saturday.
    BUSINESS_DAYS: businessDays,
    // One-off closures (public holidays, shutdowns) as explicit dates. A real
    // per-country holiday calendar stays deferred — see
    // docs/03_system_architecture_diagrams.md § Deferred scope.
    BUSINESS_CLOSED_DATES: closedDates,
  })
  .refine((env) => env.BUSINESS_HOURS_START < env.BUSINESS_HOURS_END, {
    message: 'BUSINESS_HOURS_START must be earlier than BUSINESS_HOURS_END',
    path: ['BUSINESS_HOURS_END'],
  })
  // Fail at boot, not at the first request: an unknown zone makes every
  // availability query throw a RangeError from Intl deep inside the handler.
  .refine(
    (env) => {
      try {
        new Intl.DateTimeFormat('en-US', { timeZone: env.BUSINESS_TIMEZONE })
        return true
      } catch {
        return false
      }
    },
    { message: 'BUSINESS_TIMEZONE must be a valid IANA time zone', path: ['BUSINESS_TIMEZONE'] },
  )

export function validate(config: Record<string, unknown>) {
  const result = envValidationSchema.safeParse(config)

  if (!result.success) {
    throw new Error(`Environment variables validation failed: ${result.error.message}`)
  }

  return result.data
}
