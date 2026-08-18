<!-- TEMPLATE — copy into <scenario>/directives/ and specialize.
     SPECIALIZE: the `createLogger(<service>)` name and the LogContext values. Everything else is mechanism — port verbatim.
     Do NOT delete a rule that doesn't apply yet — mark it ⏸ with its trigger and keep it.
     Fixed a real bug in a scenario's copy? Port it back here in the SAME task. -->

# Observability & Logging Standard

> Ported **verbatim** from `../service-appointment-scheduler/directives/logging_standard.md`
> (itself trimmed from Cortex's 345-line version, which spends most of its length on Elasticsearch
> index routing, Kibana RBAC, ILM retention, gRPC and Kafka consumer logging — none of which
> exists in either scenario). Every rule below applies here unchanged: same
> `packages/shared-kernel` logger, same `nestjs-pino` wiring, same `TraceContextMiddleware`, same
> `GlobalExceptionFilter` / `HttpLoggingInterceptor` — including **the same two spec files** that
> lock in the two real bugs described at the bottom. Only the `LogContext` values differ, and
> those live in `log-context.ts`, not here.

## The Dual-Logging Philosophy

Logging splits into two independent layers:

### 1. HTTP Layer Log

**Location**: `infrastructure/http/interceptors/http-logging.interceptor.ts`

Observes the transport layer: method, route, status code, IP, user-agent, total duration. Acts as
the gatekeeper log — every request, tiered by status (`error` ≥500, `warn` ≥400, `log` otherwise).

### 2. Business Layer Log (CQRS)

The CQRS bus logs command/query/event lifecycle independent of HTTP — see "Buses & logger" below.
Once a handler is written, its business-layer log line and the HTTP-layer log line for the same
request correlate via `requestId`/`trace_id`, letting you see whether latency came from the
network/framework or the handler itself.

## Standard Output Format

Always structured JSON. Never `console.log` — use `createLogger(serviceName)` from
`@scheduler/shared-kernel`. Dev mode: `pino-pretty` to console. Prod mode: plain JSON to stdout
(`pino/file`, `destination: 1`) — no log-shipping sink wired at init (see
`packages/shared-kernel/src/logger/index.ts`'s own doc comment for the seam if one is added later).

## Logger Hierarchy — ROOT once, CHILD everywhere (REQUIRED)

> ⚠️ Known gotcha: calling `createLogger()` more than once creates a **separate** pino transport
> (its own worker thread) each time. Calling it ad-hoc in feature code duplicates transports and
> loses `requestId` correlation. That is NOT a child logger.

| Role | How | Called where |
|---|---|---|
| **ROOT** logger (1 transport / process) | `createLogger('scheduler-api')` | **ONE place only**: `app.module.ts`'s `LoggerModule.forRootAsync` |
| **CHILD** logger (every component) | DI, never self-created | service/middleware/handler |

```typescript
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
constructor(@InjectPinoLogger(XxxService.name) private readonly logger: PinoLogger) {}
```

`@InjectPinoLogger(name)` attaches `context: name`. ⛔ **Forbidden**: `const logger =
createLogger('foo')` at module scope or in feature code — `createLogger` is composition-root only.

### Every log call passes `context: LogContext.X` explicitly — no exceptions

Two implicit-context mechanisms are **banned**, not just discouraged: `@InjectPinoLogger(ClassName.name)`'s
auto-context, and `.child({context})`. Both were found to produce real bugs in Cortex — verified
against real pino/nestjs-pino instances, not theoretical:

1. `nestjs-pino`'s `PinoLogger.call()` does `Object.assign({context: this.context}, firstArg)` — if a
   log call ALSO passes `context` explicitly, the explicit one silently wins and the injected-name
   binding becomes dead code that still *looks* load-bearing.
2. A plain-pino `.child({context: X})` followed by a call that ALSO passes `{context: Y}` produces
   a JSON log line with the `context` key written **twice** — malformed JSON, correct only by
   accident (most parsers take the last occurrence).

**Rule**: every log call, everywhere, passes `context: LogContext.X` explicitly. Need a value that
doesn't exist yet? Add it to `packages/shared-kernel/src/logger/log-context.ts` — even if only one
call site needs it today. Never fall back to an implicit class name.

## Correlation-id — `trace_id`/`span_id`/`parent_span_id`, automatic, not opt-in

`TraceContextMiddleware` opens the trace-context ALS for every request. `logger/index.ts`'s
`traceLogMethodHook` injects the fields into **every** log call automatically (chained with the
redact hook — pino only accepts one `hooks.logMethod`) — no call site needs to remember
`...traceLogFields()`. No-op when there's no active trace context (e.g. a log line from process
startup).

⚠️ **This is not distributed tracing.** These fields are inserted per log line for manual
correlation in a log viewer — there's no real span concept (start/end/duration, parent/child tree)
and no visualization backend (Jaeger/Tempo). That would need an OpenTelemetry SDK, HTTP/Prisma
instrumentation, and a Collector — not built, not planned at this scope. Don't conflate the two.

## Log security — Redaction (REQUIRED)

- Redaction is applied at the **LOGGER** level, not per-method — every level (`info`/`warn`/`error`/
  `debug`) is masked, inherited by every child logger.
- `createLogger`'s `redact` option (pino, in-process, BEFORE any transport) masks
  `password/token/accessToken/refreshToken/secret/authorization/cookie` + one-level-nested
  variants + auth headers. Censor = `[REDACTED]`. Single source of truth: `LOG_REDACT_PATHS`
  (locked by `logger/redact.spec.ts`).
- **PII is masked too**: `email`, `username` are in `SENSITIVE_LOG_KEYS` alongside secrets,
  masked at ANY depth via `deepRedact`. **Deliberate trade-off**: identify a user in logs by
  `userId`, never by email.
- ⚠️ **Two limitations to know:**
  1. `LOG_REDACT_PATHS`'s fixed-depth entries only catch one level of nesting
     (`input.password`, not `a.b.password`) — `deepRedact` (the logMethod hook) is the
     depth-agnostic backstop, but only for keys already in `SENSITIVE_LOG_KEYS`.
  2. Redaction masks **fields in an object**, never a string message. `` logger.info(`pw=${pw}`) ``
     leaks — always pass data through the object (`logger.info({ pw }, 'msg')`), never interpolate
     a secret into the message string.
- Adding a new secret field (e.g. `apiKey`) → add its path to `LOG_REDACT_PATHS`. Don't rely on
  "remember not to log it."

## Buses & logger — verbosity by bus semantics

Log level is NOT uniform across the three buses — it scales with (write impact × audit value) and
inversely with frequency:

| Bus | Gets a logger? | Level | Why |
|---|---|---|---|
| `CommandBus` | via internal middleware, not constructor | `info` lifecycle (executing→success+duration) + `error` | writes, single handler, caller waits, audit-worthy, low frequency |
| `QueryBus` | **yes**, `new QueryBus(logger)` | only `debug` (name+duration) | reads, HIGH frequency, HTTP-layer already logged the request; another `info` is noise |
| `EventBus` | **yes**, `new EventBus(logger)` | `error` on handler failure + `debug` dispatch | fan-out fire-and-forget; errors are swallowed so `error` is the only signal |

⛔ Don't copy `CommandBus`'s `info` executing/success onto Query/Event. Buses stay pure POJO —
`ILogger` is shared-kernel's abstraction, doesn't violate `cqrs_pattern.md`.

## Shared HTTP Utilities (shared-kernel)

All HTTP-layer response-shape logic comes from `@scheduler/shared-kernel`, never rebuilt inline:

| Utility | Used in |
|---|---|
| `httpStatusToCode(status)` | `GlobalExceptionFilter` — maps HTTP status → semantic code string |
| `buildErrorBody({ code, message, details, requestId })` | `GlobalExceptionFilter` — standard `ErrorResponse` |
| `buildSuccessBody({ data, message, requestId })` | `ResponseInterceptor` — standard `SuccessResponse` |

Standard response shape (invariant):

```json
// Success
{ "success": true, "data": {}, "message": "...", "meta": { "requestId": "...", "timestamp": "...", "version": "1.0.0" } }

// Error
{ "success": false, "message": "...", "error": { "code": "NOT_FOUND", "details": [] }, "meta": { "requestId": "...", "timestamp": "...", "version": "1.0.0" } }
```

## Two real bugs, already fixed in the code you're reading — know why, don't "fix" them back

Both were found and fixed in Cortex before this port; the fixes are already in the ported
`infrastructure/http/` files. Documented here so nobody reverts them thinking they're
simplifications.

1. **HTTP-layer status must be read from `res.raw.once('finish', ...)`, not RxJS `finalize()`.**
   `finalize()` on `next.handle()` fires WHILE an exception is still propagating out of the
   interceptor chain — BEFORE `GlobalExceptionFilter` (registered as `APP_FILTER`, outside the
   interceptor) has called `reply.status(...)`. Reading `res.statusCode` there logs every 4xx/5xx
   as a fake `200`. `http-logging.interceptor.spec.ts` (a real `NestFactory.create` + Fastify app,
   not a mocked `ExecutionContext`) locks this in — a mock cannot reproduce the ordering bug.
2. **`GlobalExceptionFilter` must inject `PinoLogger` via `@InjectPinoLogger`, never read
   `req.log` directly.** Under NestJS+Fastify+`nestjs-pino`, `req.log` resolves to a silent stub
   (has a callable `.error()` that never throws, but `.level`/`.bindings()` are `undefined` — not
   a real pino instance). `nestjs-pino` wires its logger via AsyncLocalStorage, consumed correctly
   only through DI-injected `PinoLogger`/`Logger`. Using `req.log` directly means every truly
   unhandled exception (not `HttpException`/`ApplicationError`) is silently logged with zero
   trace of the real error message or stack. `global-exception.filter.spec.ts` (real app, throws a
   real `Error`) locks this in.

**The lesson generalizes**: a unit test with a mocked `ExecutionContext`/`reply` cannot catch
either bug — both are about execution *order* and *what a property actually resolves to at
runtime*, not what a function returns given inputs. When in doubt about an HTTP-layer boundary,
test with a real `NestFactory.create()` + adapter + `.inject()`, not a mock.

## Enforcement checklist for AI Workflows

1. `TraceContextMiddleware` is applied in `AppModule.configure()` — already done; keep it there
   for any future HTTP-facing addition.
2. **Do not** inject `ILogger` into domain entities or core domain logic unless the module is
   genuinely event-sourced. Rely on the CQRS pipeline for observability.
3. **Always** use `buildErrorBody`/`buildSuccessBody`/`httpStatusToCode` from `shared-kernel` —
   never rebuild the response shape locally.
4. **Never use `req.log`/`request.log` directly** anywhere in this codebase (Filters, Guards,
   Interceptors included) — always inject `PinoLogger`/`Logger` via DI. A call not throwing does
   NOT mean it logged — verify any new logging code touching the HTTP boundary with a real app
   test, never trust a mocked `ExecutionContext`/`reply`.
5. **Every log call passes `context: LogContext.X` explicitly, no exceptions.** Need a context
   that doesn't exist yet? Add it to `log-context.ts`.
