import pino from 'pino'
import { traceLogFields } from '../tracing/trace-context.js'

export * from './log-context.js'

const SENSITIVE_LOG_KEYS = [
  // Secrets — masking these is non-negotiable.
  'password',
  'newPassword',
  'currentPassword',
  'token',
  'accessToken',
  'refreshToken',
  'secret',
  'authorization',
  'cookie',
  // PII — masked at ALL levels/depths like secrets, so a full request body /
  // command payload logged wholesale can't leak personal data. TRADE-OFF:
  // email/username are now [REDACTED] in EVERY log, including intentional
  // operational ones — identify a user by `userId` in logs, never by email.
  // (Full mask, not partial like `j***@b.com`: the redact mechanism is
  // all-or-nothing per key; partial masking would need a per-field censor,
  // deferred until there's a real need to see a hint of the email in logs.)
  'email',
  'username',
] as const

/**
 * Secret field paths masked in-process before any transport, via pino's
 * built-in `redact` option. `*.x` matches EXACTLY one nesting level (e.g.
 * `input.password`) — a payload like `{ input: { user: { password } } }` (2+
 * levels deep) is NOT caught by this alone (fast-redact's wildcard has no
 * "any depth" syntax). This stays as a cheap first-pass safety net; the real
 * depth-agnostic defense is `deepRedact`/`redactLogMethodHook` below, which
 * `createLogger` wires in as a pino hook. Exported so it has a single source
 * of truth and can be asserted in tests.
 */
export const LOG_REDACT_PATHS = [
  ...SENSITIVE_LOG_KEYS,
  ...SENSITIVE_LOG_KEYS.map((k) => `*.${k}`),
  'req.headers.authorization',
  'req.headers.cookie',
  'request.headers.authorization',
  'request.headers.cookie',
]

export const LOG_REDACT_CENSOR = '[REDACTED]'

const SENSITIVE_LOG_KEY_SET = new Set<string>(SENSITIVE_LOG_KEYS)

/**
 * Depth-agnostic secret masking — walks the ENTIRE object graph (any nesting
 * level, arrays included) and blanks any key in SENSITIVE_LOG_KEY_SET wherever
 * it appears, unlike LOG_REDACT_PATHS above which only matches a fixed depth.
 * Returns a NEW object graph (no in-place mutation) so the caller's original
 * object is untouched even after logging. `seen` guards against circular
 * references re-entering the same object.
 */
function deepRedact(value: unknown, seen: WeakSet<object> = new WeakSet()): unknown {
  if (value === null || typeof value !== 'object') return value
  if (seen.has(value as object)) return value
  seen.add(value as object)

  if (Array.isArray(value)) {
    return value.map((item) => deepRedact(item, seen))
  }

  const out: Record<string, unknown> = {}
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    out[key] = SENSITIVE_LOG_KEY_SET.has(key) ? LOG_REDACT_CENSOR : deepRedact(val, seen)
  }
  return out
}

/**
 * pino `hooks.logMethod` — runs BEFORE fast-redact/serialization/transport,
 * deep-redacting the first log argument if it's an object. Exported (not
 * inlined in createLogger) so tests can build a pino instance with the exact
 * same behavior the real root logger gets, instead of re-deriving it.
 */
export const redactLogMethodHook: NonNullable<pino.LoggerOptions['hooks']>['logMethod'] = function (
  inputArgs,
  method,
) {
  if (typeof inputArgs[0] === 'object' && inputArgs[0] !== null) {
    inputArgs[0] = deepRedact(inputArgs[0]) as object
  }
  method.apply(this, inputArgs as Parameters<typeof method>)
}

/**
 * pino `hooks.logMethod` — injects `trace_id`/`span_id`/`parent_span_id`
 * (tracing/trace-context.ts) into EVERY log call automatically, then
 * delegates to `redactLogMethodHook`. Exists because those fields used to be
 * opt-in (`...traceLogFields()` spread manually into each log call) and it
 * was already found un-applied in 3 real places (GlobalExceptionFilter,
 * auth-service's globalErrorHandler, CQRS LoggingMiddleware) — the same
 * "forgettable at every call site" problem `deepRedact` solved for secrets,
 * fixed the same way: a hook that can't be forgotten because it isn't called
 * per-site at all. No-op (adds nothing) when there's no active trace context
 * (e.g. a log line from process startup, before any request/message arrives).
 */
const traceLogMethodHook: NonNullable<pino.LoggerOptions['hooks']>['logMethod'] = function (
  inputArgs,
  method,
  level,
) {
  const fields = traceLogFields()
  if (Object.keys(fields).length > 0) {
    if (typeof inputArgs[0] === 'object' && inputArgs[0] !== null) {
      Object.assign(inputArgs[0], fields)
    } else {
      // msg-only call (`logger.info('some message')`) — pino accepts a
      // leading mergingObject before the message string, so prepend one
      // instead of dropping the trace fields.
      ;(inputArgs as unknown[]).unshift(fields)
    }
  }
  redactLogMethodHook.call(this, inputArgs, method, level)
}

export interface ILogger {
  // Structured form (object first) — used to attach the `context` field and
  // other structured bindings. Mirrors pino / nestjs-pino LogFn overloads.
  info(obj: object, msg?: string, ...args: unknown[]): void
  info(msg: string, ...args: unknown[]): void
  error(obj: object, msg?: string, ...args: unknown[]): void
  error(msg: string, ...args: unknown[]): void
  warn(obj: object, msg?: string, ...args: unknown[]): void
  warn(msg: string, ...args: unknown[]): void
  debug(obj: object, msg?: string, ...args: unknown[]): void
  debug(msg: string, ...args: unknown[]): void
  // ⚠️ Deliberately NO `child()` here. First reason: nestjs-pino's `PinoLogger`
  // class (what @InjectPinoLogger injects) has no `.child()` method at all —
  // adding it to this interface breaks NestJS' CQRS wiring. Second, stronger
  // reason: even where `.child()` DOES exist (a plain `pino.Logger`), binding
  // `context` via `.child({context})` and then ALSO passing `context`
  // explicitly in a log call's payload (the required pattern — see
  // log-context.ts) produces a JSON log line with the `context` KEY WRITTEN
  // TWICE (`"context":"X","context":"Y"`) — pino's `child()` bindings and a
  // same-named field in the per-call object are NOT merged, both get
  // serialized. Every log call, everywhere, sets `context: LogContext.X`
  // explicitly and ONLY that way — no binding mechanism (`child()`,
  // `@InjectPinoLogger(name)`'s auto-context) may be relied on to supply it.
}

/**
 * `createLogger` — stdout-only transport (pretty in development, plain JSON
 * in production). No log-shipping sink is wired here at T1/T2; if a
 * structured-logging backend (Loki, an ELK-style stack) is added later, it
 * plugs in as an additional pino transport target without touching anything
 * above this function — the redact/trace hooks run before any transport, so
 * they protect a future sink automatically. See
 * docs/03_architecture.md § Deferred scope.
 */
export const createLogger = (serviceName: string) => {
  const isDevelopment = process.env.NODE_ENV !== 'production'

  const transport = isDevelopment
    ? pino.transport({
        target: 'pino-pretty',
        options: { colorize: true },
      })
    : pino.transport({
        target: 'pino/file',
        options: { destination: 1 }, // stdout
      })

  return pino(
    {
      name: serviceName,
      level: process.env.LOG_LEVEL || 'info',
      base: { serviceContext: serviceName },
      // ISO-8601 timestamp field instead of pino's default epoch-ms `time` —
      // easier to read in local dev and consistent with what a log-aggregation
      // backend would expect if one is added later (see docstring above).
      timestamp: () => `,"@timestamp":"${new Date().toISOString()}"`,
      // Defense-in-depth secret masking: applied in-process BEFORE any transport,
      // so a secret can never reach the log sink even if a full payload/body/
      // headers object is logged anywhere. `redact` is the cheap fixed-depth
      // pass; `hooks.logMethod` is the depth-agnostic pass that actually catches
      // secrets nested 2+ levels deep (see deepRedact).
      redact: { paths: LOG_REDACT_PATHS, censor: LOG_REDACT_CENSOR },
      // traceLogMethodHook injects trace_id/span_id/parent_span_id on EVERY
      // log call, then chains into redactLogMethodHook — pino only accepts 1
      // logMethod hook, so this is the single composed entry point.
      hooks: { logMethod: traceLogMethodHook },
    },
    transport,
  )
}
