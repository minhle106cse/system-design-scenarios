import { Counter, Histogram } from 'prom-client'

/**
 * Booking-domain metrics — the panels `docker-init/grafana/provisioning/dashboards/`
 * reserved a placeholder for at init (`directives/observability_monitoring.md` §2).
 *
 * Metrics are registered on prom-client's default registry, the same one
 * `collectDefaultMetrics()` in `main.ts` uses and `/metrics` serves. They are
 * module-level singletons because prom-client throws on a duplicate metric name;
 * a NestJS provider would register a second copy under `--watch` reloads.
 *
 * Importing this from the application layer is deliberate and lint-legal: the
 * boundary rules in `eslint.config.mjs` block `@/infrastructure/database` and
 * `@/infrastructure/http` from a module's application layer — not observability.
 * Measurement is a cross-cutting concern the handler genuinely owns, and routing
 * it through a port abstraction would add an interface with exactly one
 * implementation for no boundary that anyone can violate.
 */

/**
 * Counter. Raw value is meaningless — read as `rate(...)`
 * (`directives/observability_monitoring.md` §2).
 *
 * `outcome` is the whole point of this metric. The two `*_concurrently` values
 * come from ADR-0002's exclusion constraint firing AFTER the application-level
 * availability check passed, so their rate answers a question nothing else can:
 * how often does the database backstop actually catch a real race? A nonzero
 * rate is not an error budget being burned — it is the guarantee working.
 *
 * A rising `no_free_service_bay` rate, by contrast, is a capacity signal, and
 * `service_bay_taken_concurrently` rising while bays are free is the signal that
 * deterministic selection (ADR-0003 §2.2) is concentrating load and should be
 * revisited.
 */
export const bookingAttemptCounter = new Counter({
  name: 'scheduler_api_booking_attempt_total',
  help: 'Booking attempts by outcome (booked, or the reason the window was refused)',
  labelNames: ['outcome'] as const,
})

export type BookingOutcome =
  | 'booked'
  | 'no_service_bay_at_dealership'
  | 'no_qualified_technician_at_dealership'
  | 'no_free_service_bay'
  | 'no_free_qualified_technician'
  | 'service_bay_taken_concurrently'
  | 'technician_taken_concurrently'

export function recordBookingAttempt(outcome: BookingOutcome): void {
  bookingAttemptCounter.inc({ outcome })
}

/**
 * Histogram, in SECONDS (Prometheus convention — never milliseconds).
 *
 * Buckets are tuned for a handful of indexed queries plus in-memory set
 * subtraction, which should land in the low tens of milliseconds. The top
 * buckets exist to make a regression visible rather than to be occupied: if p95
 * crosses 250ms, the in-memory approach ADR-0003 §3 deferred the SQL rewrite
 * against has stopped being the right trade-off.
 */
export const availabilityCheckDuration = new Histogram({
  name: 'scheduler_api_availability_check_duration_seconds',
  help: 'Wall-clock duration of a GET /availability computation, in seconds',
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1],
})

/**
 * Starts a timer and returns the function that stops it. Mirrors prom-client's
 * own `startTimer()` shape so the call site reads as a plain try/finally with no
 * clock arithmetic — and, importantly, so the observation still happens when the
 * handler throws.
 */
export function startAvailabilityTimer(): () => void {
  return availabilityCheckDuration.startTimer()
}
