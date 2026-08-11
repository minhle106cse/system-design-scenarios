export * from './errors/app-error.js'
export * from './errors/application-error.js'
export * from './errors/infra-error.js'

export * from './http/response.js'
export * from './http/response.utils.js'

export * from './schemas/common.schema.js'

export * from './logger/index.js'

// Resilience — shared Prisma transient-error classification + observability,
// and the generic `transient` marker a domain error can opt into.
//
// NOTE: circuit-breaker.ts is NOT ported here. This scenario makes no outbound
// call to an unreliable dependency, so a breaker would protect nothing (see
// .ai/plans/init-source.plan.md §3.1c / docs/03_system_architecture_diagrams.md § Deferred
// scope for the trigger that brings it back).
export * from './resilience/prisma-transient-error.js'

// CQRS
export * from './cqrs/index.js'

// Database abstractions — Unit of Work as a value (ADR-0001)
export * from './database/tx-scope.js'
export * from './database/tx.error.js'
export * from './database/abstract-tx-runner.js'
// `transaction.context.ts` (getTx/runInTransaction) is intentionally NOT exported —
// AbstractTxRunner is its only consumer repo-wide. Re-exporting it would put the
// exact ambient-transaction-fallback primitive ADR-0001 exists to stop using back
// on the public surface for any repository to reach for directly.

// Tracing — W3C traceparent propagation across HTTP boundaries.
// Named (not `export *`) — `traceLogFields` is deliberately excluded: since
// logger/index.ts's traceLogMethodHook applies it to every log call
// automatically, no consumer outside shared-kernel has a real reason to call
// it directly; keeping it off the public surface matches the audit already
// done for the other internal-only helpers in this module.
export {
  type TraceContext,
  runWithTraceContext,
  startTraceContext,
  getCurrentTraceparent,
} from './tracing/trace-context.js'

// NOT ported at T1/T2 (see .ai/plans/init-source.plan.md §3.1c/§3.3/§3.4 for each trigger):
//   - auth/{system,org}-permissions.ts — no RBAC modelled in this scenario
//   - logger/audit.ts — no audit trail requirement yet (cancel/reschedule would add one)
//   - messaging/** — arrives with the first asynchronous flow (T3)
//   - grpc/** — arrives with a second service (T4)
