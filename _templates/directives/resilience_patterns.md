<!-- TEMPLATE — copy into <scenario>/directives/ and specialize.
     SPECIALIZE: the §3 worked example (a domain error that must NOT be retried — every scenario has one); §2/§6 triggers; the summary table statuses.
     Do NOT delete a rule that doesn't apply yet — mark it ⏸ with its trigger and keep it.
     Fixed a real bug in a scenario's copy? Port it back here in the SAME task. -->

# SOP: Resilience Patterns

> Ported from `../service-appointment-scheduler/directives/resilience_patterns.md` (itself heavily
> condensed from Cortex's 844-line version, which is largely a decision history across patterns
> neither scenario needs yet — AI circuit breakers, Kafka outbox, per-org rate limiting, gRPC
> shutdown). Section numbering and structure kept identical to that file on purpose. Built here:
> retry (in the CQRS bus) and graceful shutdown (in `main.ts`). Idempotency, circuit breaker,
> outbox and rate limiting are **annotated, not built** — see each section's trigger.

## 1. Idempotency

See `idempotency_strategy.md` — the HTTP `X-Idempotency-Key` claim-before-execute pattern, backed
by an `IdempotencyRecord` table. That directive covers the mechanism in full; this file doesn't
duplicate it.

⏸ **Not built here, and not currently needed**: every write path is already idempotent by
construction — the regenerate endpoint is a full replace, and the import endpoint upserts on a
natural key. Running either twice yields the same
state. **Trigger:** an append-only mutation appears.

## 2. Transactional Outbox — deferred

**Not built.** The pattern: append an outbox row in the SAME transaction as the domain write, then
a separate poller publishes it to a message broker — needed the moment a write must reliably
trigger work outside this database. Until then, there's nothing to publish reliably, so there's no
outbox to build.

**Trigger:** the first requirement for "notify someone when X happens" that can't just be a
synchronous side effect of the same request. See the scenario's architecture doc, § Deferred scope.

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
`AddAssignmentHandler` takes a `tx` parameter (transactional) and can throw `RosterViolationError`
when the domain gate refuses the operation. That error is
deliberately **not** marked `transient: true`, so `isTransient` returns `false` for it and
`withRetry` never touches it — a staff member over their weekly cap is still over it on the second
attempt; retrying guarantees three more failures and delays the `422` the caller needs in order to
pick a different staff member or shift. This is a case for judgment at the error-classification
level, not the "split into a saga" bullet above: the handler stays transactional (its writes still
need one atomic scope), only this specific outcome opts out of retry by omission. Same shape as
scenario 01's `AppointmentSlotConflictError`, for the same reason.

## 3.1 Circuit Breaker — deferred, not built

**Not built.** `resilience/circuit-breaker.ts` exists in Cortex's shared-kernel as a pure,
framework-free algorithm (constructor only needs `ILogger`) — genuinely portable, but this repo
has no outbound call to an unreliable dependency to wrap it around. The only thing this service
calls over a network is its own Postgres, already covered by §3's retry.

**Trigger:** the first synchronous call to something this service doesn't own — a payment gateway,
an email/SMS provider, a second internal service. If/when that happens, port `circuit-breaker.ts`
back from Cortex (`../../distributed-social-platform/packages/shared-kernel/`) and wrap the call in
a single-purpose `{Dependency}Caller` class (constructor takes only the `CircuitBreaker` + the
thing it protects — no business logic in the caller itself).

## 4. Rate Limiting & Throttle — deferred, not built

**Not built.** No `@nestjs/throttler` wiring, no per-route/per-IP limiting. §1's reasoning already
covers this domain's actual double-submit hazard (there isn't one, by construction) — general
abuse-rate limiting is a different concern with its own cost/complexity, not required by the brief,
and not added speculatively ("sequence, not omission").

**Trigger:** a public-facing deployment, or evidence of abusive traffic patterns during testing.
The brief names deployment itself as out of scope, so this is not expected to fire within the
exercise.

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

**None.** No `@Cron` job exists in this service — scenario 01's one job is
`IdempotencyCleanupService`, and §1's mechanism isn't built here, so there is nothing to purge.
If one is ever added (e.g. purging old `ScheduleRun` rows), a single `@Cron`-decorated service is
sufficient at this scale. Cortex tracks every cron job's schedule/last-run/failure state in a
`ScheduledJobRegistry` for an ops dashboard — port that registry back only if a **second**
scheduled job appears, rather than duplicating ad-hoc tracking per job.

## 7. Correlation-id (trace context)

See `logging_standard.md` — W3C `traceparent` propagation across HTTP, automatic via
`TraceContextMiddleware` + `traceLogMethodHook`. Not duplicated here.

---

## Summary — which pattern, when

| Situation | Pattern | Status |
|---|---|---|
| A DB write hits a deadlock | Retry (`P2034` only, full jitter) | ✅ Built |
| Process receives SIGTERM/SIGINT | Graceful shutdown | ✅ Built |
| Client retries a mutation (double-submit) | HTTP idempotency-key | ⏸ Not needed — every write here is already idempotent by construction (§1) |
| A write must reliably trigger external work | Transactional Outbox | ⏸ Deferred, no trigger yet |
| A call to something this service doesn't own | Circuit Breaker | ⏸ Deferred — no such call exists |
| Abuse-rate protection | Rate limiting | ⏸ Deferred — no public deployment |
