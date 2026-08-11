# SOP: Resilience Patterns

> Heavily condensed from Cortex's 844-line version, which is largely a decision history (multiple
> superseded designs, kept verbatim per Cortex's own "don't edit history" convention) across
> patterns this repo doesn't need yet — AI circuit breakers, Kafka outbox, per-org rate limiting,
> gRPC shutdown. Kept: retry (implemented, in the CQRS bus), idempotency (pointer — its own
> directive), graceful shutdown (implemented, in `main.ts`), and a background-jobs note (our one
> cron job). Circuit breaker, outbox, and rate limiting are **annotated, not built** — see each
> section's trigger.

## 1. Idempotency

See `idempotency_strategy.md` — the HTTP `X-Idempotency-Key` claim-before-execute pattern, backed
by `IdempotencyRecord`. That directive covers the mechanism in full; this file doesn't duplicate it.

## 2. Transactional Outbox — deferred (T3)

**Not built.** The pattern: append an outbox row in the SAME transaction as the domain write, then
a separate poller publishes it to a message broker — needed the moment a write must reliably
trigger work outside this database (e.g. an appointment-confirmation notification). Until then,
there's nothing to publish reliably, so there's no outbox to build.

**Trigger:** the first requirement for "notify the customer / dealership when X happens" that
can't just be a synchronous side effect of the same request. See
`docs/03_system_architecture_diagrams.md § Deferred scope` and `.ai/plans/init-source.plan.md` §3.3.

## 3. Retry

Retry is not a separate middleware you opt into — it lives inside `CommandBus`'s fixed pipeline
(`withRetry` wraps the transaction), automatic for every transactional handler. See
`cqrs_pattern.md` §5 for the pipeline shape. This section only covers the retry **policy** itself.

**Only `P2034` (deadlock/write-conflict) is retried.** `P2028` (transaction/connection API error)
is deliberately excluded — it can signal connection-pool exhaustion, and auto-retrying it means
asking the *same exhausted pool* for another connection: no recovery benefit, and it adds load
exactly when the system needs to shed it (the retry-storm antipattern). This distinction is why
`isPrismaTransientError` exists as a named predicate
(`packages/shared-kernel/src/resilience/prisma-transient-error.ts`) instead of "retry any Prisma
error" — verified reasoning carried over from Cortex, not re-derived here.

```typescript
export function isPrismaTransientError(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return error.code === 'P2034'
  }
  return false
}
```

**Full-jitter backoff** — `delay = random(0, min(maxDelayMs, base·2^(n-1)))`, not fixed backoff, so
that multiple deadlock victims don't retry in lockstep and collide again.

**Observability**: every transient-error observation (both `P2034`, retried, and `P2028`, not
retried) is counted via `scheduler_api_db_transient_error_total{code,retried}` — see
`observability_monitoring.md`. This is how the P2028-exclusion decision could be revisited on real
data instead of a one-time guess.

### Rules

- Retry only **transient errors**. Never retry **4xx-class errors** (validation, not found) —
  retrying those is meaningless.
- Max 3 attempts, exponential backoff **with jitter**.
- Retry is only safe when every side effect is inside the transaction that gets rolled back. A
  command that calls something external mid-handler (a future outbound HTTP/gRPC call) is not
  retry-safe by this mechanism — that's what the (currently unexercised) saga path is for, see
  `cqrs_pattern.md` §4.
- ⛔ Don't add a new opt-in field for "should this command retry" — `transactional: true`-shaped
  handlers (in this codebase, taking a `tx` parameter) already are the sufficient condition. A
  command that must NOT be retried despite being transactional is a signal it shouldn't be
  transactional — split it into a saga instead.
- Adding a new retryable error code → ask "does retrying this while the system is already
  stressed make it worse?" before adding it to the transient set.

**Worked example — a transactional handler whose OWN error must not be auto-retried:**
`BookAppointmentHandler` takes a `tx` parameter (transactional) and can throw
`AppointmentSlotConflictError` when ADR-0002's exclusion constraint rejects the insert. That error
is deliberately **not** marked `transient: true`, so `isTransient` returns `false` for it and
`withRetry` never touches it — a taken slot stays taken; retrying against the same occupied window
guarantees three more failures and delays the `409` the caller needs in order to pick a different
one. This is a case for judgment at the error-classification level, not the "split into a saga"
bullet above: the handler stays transactional (its writes still need one atomic scope), only this
specific outcome opts out of retry by omission. Full reasoning:
`docs/adr/0003-availability-and-selection-policy.md` §2.4.

## 3.1 Circuit Breaker — deferred, not built

**Not built.** `resilience/circuit-breaker.ts` exists in Cortex's shared-kernel as a pure,
framework-free algorithm (constructor only needs `ILogger`) — genuinely portable, but this repo
has no outbound call to an unreliable dependency to wrap it around (see `.ai/plans/init-source.plan.md` §3.1c).

**Trigger:** the first synchronous call to something this service doesn't own — a DMS
integration, a payment gateway, a notification provider. If/when that happens, port
`circuit-breaker.ts` back from Cortex and wrap the call in a single-purpose `{Dependency}Caller`
class (constructor takes only the `CircuitBreaker` + the thing it protects — no business logic in
the caller itself).

## 4. Rate Limiting & Throttle — deferred, not built

**Not built.** No `@nestjs/throttler` wiring, no per-route/per-IP limiting. This scenario's
idempotency mechanism (§1) already protects against the specific hazard the brief cares
about (a client double-submitting a booking) — general abuse-rate limiting is a different concern
with its own cost/complexity, not required by the brief, and not added speculatively (see
`.ai/plans/init-source.plan.md` §1's "sequence, not omission" framing).

**Trigger:** a public-facing deployment, or evidence of abusive traffic patterns during testing.

## 5. Graceful Shutdown

**Implemented** — `apps/scheduler-api/src/main.ts`.

### Problem

A process stopped abruptly (new deploy, container restart, `docker stop`) mid-request:
- An in-flight HTTP request is cut off — the client gets a connection reset instead of a response.
- The Postgres connection pool is severed abruptly instead of closing cleanly (Prisma never gets
  to `$disconnect()`).

### Solution

Catch the stop signal (`SIGTERM`/`SIGINT`) → **stop accepting new work** on HTTP, but **let
in-flight work finish** (bounded by a timeout) → only then close the DB connection → exit cleanly.

```typescript
const SHUTDOWN_TIMEOUT_MS = 10_000

const shutdown = (signal: string) => {
  logger.log(`${signal} received, shutting down gracefully...`, LogContext.LIFECYCLE)

  const forceExit = setTimeout(() => {
    logger.error('Graceful shutdown timed out, forcing exit', LogContext.LIFECYCLE)
    process.exit(1)
  }, SHUTDOWN_TIMEOUT_MS)
  forceExit.unref() // this timer must not itself keep the process alive

  app
    .close() // stops accepting new HTTP, waits for in-flight requests, runs onModuleDestroy
              // hooks (PrismaService.$disconnect, etc.)
    .then(() => {
      clearTimeout(forceExit)
      logger.log('Shutdown complete', LogContext.LIFECYCLE)
      process.exit(0)
    })
    .catch((err) => {
      logger.error({ err, msg: 'Error during shutdown' }, LogContext.LIFECYCLE)
      process.exit(1)
    })
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
```

No separate gRPC shutdown step (Cortex's version also closes a gRPC server) — this service has
none.

### ⚠️ Windows gotcha (dev machine, not a code bug)

Windows has no real POSIX signals. `SIGTERM`/`SIGINT` on Node-Windows are only emulated via the
console-control-handler, and **only work when you press Ctrl+C in the exact terminal running the
process**. Sending a signal externally (`taskkill` without `/F`, or `process.kill(otherPid,
'SIGINT')` from another process) on Windows almost always behaves like a hard kill (bypasses the
registered handler). To actually see this code run on Windows: `npm run dev`, then press Ctrl+C
yourself in that terminal. In Docker/Linux (the real target of this pattern), `docker stop` /
Kubernetes sends a real POSIX `SIGTERM` and the handler runs as designed.

### Rules

- ⛔ Never close the DB before closing the HTTP transport — in-flight requests would crash
  mid-response instead of completing.
- Register the handler in **exactly one place** (`main.ts`'s composition root) — not scattered.
- The forced-exit timeout is required — if a request hangs indefinitely (deadlock, an unbounded
  external call), graceful shutdown must have a hard exit after N seconds, not wait forever.
- `forceExit.unref()` — if shutdown finishes before the timeout, that timer must not keep the
  process alive.

## 6. Background Jobs

One scheduled job at init: `IdempotencyCleanupService` (`@Cron('0 3 * * *')`, see
`idempotency_strategy.md`) — purges expired `IdempotencyRecord` rows nightly. Cortex tracks every
cron job's schedule/last-run/failure state in a `ScheduledJobRegistry` for an ops dashboard; not
ported here since this is the only job (see `.ai/plans/init-source.plan.md` §8) — port that registry back if a
second scheduled job is ever added, rather than duplicating ad-hoc tracking per job.

## 7. Correlation-id (trace context)

See `logging_standard.md` — W3C `traceparent` propagation across HTTP, automatic via
`TraceContextMiddleware` + `traceLogMethodHook`. Not duplicated here.

---

## Summary — which pattern, when

| Situation | Pattern | Status |
|---|---|---|
| Client retries a mutation (double-submit) | HTTP idempotency-key | ✅ Built |
| A DB write hits a deadlock | Retry (`P2034` only, full jitter) | ✅ Built |
| Process receives SIGTERM/SIGINT | Graceful shutdown | ✅ Built |
| A write must reliably trigger external work | Transactional Outbox | ⏸ Deferred (T3) |
| A call to something this service doesn't own | Circuit Breaker | ⏸ Deferred |
| Abuse-rate protection | Rate limiting | ⏸ Deferred |
