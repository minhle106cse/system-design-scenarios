/**
 * SINGLE SOURCE OF TRUTH for every log `context` field value in the system — shared AND
 * app-local. Ported from `../service-appointment-scheduler/packages/shared-kernel/src/logger/log-context.ts`
 * with the booking-domain entries (`BOOKING`, `AVAILABILITY`) replaced by this domain's, and the
 * entries for infrastructure this repo doesn't have (gRPC, Kafka outbox, audit log, HTTP
 * idempotency — `backend-architecture-reversal.plan.md` §6) dropped rather than carried as dead
 * weight. The rule itself is unchanged and still the reason this file exists — see below.
 *
 * ⛔ FORBIDDEN: relying on `@InjectPinoLogger(ClassName.name)`'s auto-injected class name, or
 * Fastify's `logger.child({ context: ClassName.name })`, as the ACTUAL `context` value that ends
 * up in a log line. Both were found broken in the source codebase (see the source file's own
 * comment for the two verified failure modes) — every log call site passes `context` EXPLICITLY
 * from this file, full stop.
 *
 * ✅ REQUIRED: if a class needs a context value that doesn't exist yet, ADD IT HERE — never invent
 * an implicit one. This registry is the one place a human or AI reads to know every context string
 * that can appear in a log line.
 */
export const LogContext = {
  // CQRS pipeline — shared-kernel middlewares, identical across every handler
  COMMAND_BUS: 'CommandBus',
  QUERY_BUS: 'QueryBus',
  RETRY: 'RetryMiddleware',
  TRANSACTION: 'TransactionMiddleware',
  // In-process domain event dispatcher (shared-kernel EventBus)
  EVENT_BUS: 'EventBus',
  // HTTP transport layer (NestJS interceptor / Fastify hook)
  HTTP: 'HttpLayer',
  // Unhandled exception filter / global error handler
  EXCEPTION: 'ExceptionFilter',
  // shared-kernel CircuitBreaker / resilience wrappers, should this repo ever add an outbound call
  CIRCUIT_BREAKER: 'CircuitBreaker',
  // The `scheduling` module's write path (scheduler-api) — CreateSchedule, AddStaff, DefineShift,
  // AutoSchedule, EditAssignment handlers. One context for "the roster/schedule state changed".
  SCHEDULING: 'Scheduling',
  // The demand CSV importer specifically — kept separate from SCHEDULING because it is a
  // file-upload path with its own failure shape (row/column-precise warnings and errors, init
  // plan §4), not a state-transition log line.
  IMPORT: 'DemandImport',
  // Process-level start/shutdown (main.ts) — a real log source, gets a real context.
  LIFECYCLE: 'Lifecycle',
} as const

export type LogContextValue = (typeof LogContext)[keyof typeof LogContext]
