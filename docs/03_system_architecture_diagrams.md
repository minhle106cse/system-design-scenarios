# System Design Document

> This is the "System Design Document" deliverable for this scenario. It
> covers: an architecture diagram, component roles, data flow, chosen technologies with
> justification, the observability strategy, a dedicated GenAI-in-design-phase section, and a
> deferred-scope section explaining what was deliberately left out and why.

## 1. Architecture diagram

```mermaid
flowchart TB
    subgraph Client["Client (stubbed)"]
        C[cURL / OpenAPI-generated client]
    end

    subgraph App["apps/scheduler-api — NestJS + Fastify"]
        direction TB
        HTTP["HTTP layer<br/>TraceContextMiddleware → ZodValidationPipe →<br/>Controller → IdempotencyInterceptor"]
        CQRS["CQRS bus<br/>CommandBus (writes) / QueryBus (reads)<br/>fixed pipeline: log → retry → transaction → handler"]
        Domain["Domain<br/>Appointment, ServiceBay, Technician,<br/>availability rules — pure TypeScript"]
        Repo["Repositories<br/>one write-repo shape per transaction<br/>(Unit of Work, ADR-0001)"]
        HealthObs["Health / Metrics<br/>/health, /metrics"]
    end

    subgraph DB["PostgreSQL"]
        direction TB
        Tables["Customer, Vehicle, Dealership,<br/>ServiceBay, Technician, ServiceType,<br/>Appointment, IdempotencyRecord"]
        Constraint["EXCLUDE USING gist<br/>(service_bay_id / technician_id, time range)<br/>WHERE status = SCHEDULED — ADR-0002"]
    end

    subgraph Obs["Observability"]
        Prom["Prometheus<br/>scrapes /metrics"]
        Graf["Grafana<br/>provisioned dashboard"]
        Logs["Structured JSON logs<br/>(pino, redacted, trace-correlated)"]
    end

    C -->|"REST + X-Idempotency-Key"| HTTP
    HTTP --> CQRS
    CQRS --> Domain
    Domain --> Repo
    Repo -->|"Prisma, inside one transaction"| Tables
    Tables -.->|"enforces"| Constraint
    HealthObs -->|scrape| Prom
    Prom --> Graf
    App -.->|stdout| Logs

    style Constraint fill:#7c2d12,stroke:#f97316,color:#fff
    style CQRS fill:#1e3a5f,stroke:#3b82f6,color:#fff
```

## 2. Component roles

| Component | Role |
|---|---|
| **HTTP layer** (`infrastructure/http/`) | Translates HTTP ↔ Command/Query. `TraceContextMiddleware` opens trace correlation; `ZodValidationPipe` validates input per-route; `IdempotencyInterceptor` prevents a double-submit from creating two appointments; `GlobalExceptionFilter` maps every error (validation, domain, unhandled) to one consistent response shape. |
| **CQRS bus** (`packages/shared-kernel/src/cqrs/`) | `CommandBus` runs every write through a fixed pipeline: log → retry (transient DB errors only) → open transaction → handler. `QueryBus` runs reads outside a transaction. Neither the retry nor the transaction boundary is opt-in per command — see ADR-0001. |
| **Domain** (`src/modules/<domain>/domain/`, added as the scheduler domain is implemented) | Pure TypeScript entities and the availability/booking business rules. No framework, no ORM — see `directives/folder_structure_sop.md`, lint-enforced. |
| **Repositories** (`infrastructure/database/prisma/`) | One write-repo shape per service (`SchedulerApiRepos`), constructed fresh per transaction — a repository instance is never usable outside the transaction it was built for (ADR-0001 §2.1). |
| **PostgreSQL** | System of record. Also the idempotency store (`IdempotencyRecord` table) and the enforcement point for the anti-double-booking guarantee (the exclusion constraint, ADR-0002) — the database is not a passive store here, it actively rejects a class of invalid state. |
| **Prometheus + Grafana** | Scrape `/metrics` (default Node.js process metrics + `scheduler_api_db_transient_error_total`), render a dashboard (`docker-init/grafana/provisioning/`). |
| **Structured logs** | JSON to stdout, `pino`. Automatic secret/PII redaction, automatic trace-id correlation — no call site opts in or forgets (`directives/logging_standard.md`). |

## 3. Data flow — booking a slot

1. Client `POST`s a booking request with an `X-Idempotency-Key` header.
2. `TraceContextMiddleware` opens a trace context (reuses an inbound `traceparent` if present).
3. `IdempotencyInterceptor` claims the idempotency key (`INSERT ... response: null` before the
   handler runs) — a retried request with the same key either replays the cached response or gets
   a fast `409` if the first attempt is still in flight, never runs the handler twice.
4. `ZodValidationPipe` validates the request body against the booking schema.
5. The controller constructs a `BookAppointmentCommand` and dispatches it via `CommandBus`.
6. `CommandBus` opens a transaction (`PrismaTxRunner`), the handler:
   - reads current availability for the requested bay/technician/window **inside the
     transaction** (never through a separate query-repo — `directives/cqrs_pattern.md`'s
     transactional-read rule),
   - constructs the `Appointment` entity,
   - calls `save()` on the write repository.
7. The `INSERT` either succeeds, or the database's exclusion constraint rejects it
   (`23P01`) if a conflicting appointment was committed by a concurrent request between step 6's
   read and this write — the **only** point where the guarantee is actually enforced
   unconditionally (ADR-0002 §3).
8. On success, the transaction commits; `IdempotencyInterceptor` persists the response for future
   replay; `ResponseInterceptor` wraps it in the standard envelope; `HttpLoggingInterceptor` logs
   the request's outcome.
9. On a constraint violation, the handler translates the Postgres error into a domain-level
   `AppointmentSlotConflictError`, which `GlobalExceptionFilter` maps to `409 Conflict`.

## 4. Technology choices, with justification

| Technology | Why |
|---|---|
| **NestJS + Fastify** | NestJS's DI + module system gives the CQRS wiring and the lint-enforced Hexagonal boundaries a natural home; Fastify over Express for lower overhead and first-class TypeScript-friendly plugin ecosystem (`@fastify/*`). |
| **PostgreSQL + Prisma** | Postgres because the flagship requirement (ADR-0002) needs a real relational database with range-type and exclusion-constraint support — not every database can express this guarantee declaratively. Prisma for type-safe queries and migrations, with the understanding (and one hand-written exception, ADR-0002) that its schema DSL doesn't cover every Postgres feature. |
| **CQRS + Unit-of-Work (`@scheduler/shared-kernel`)** | Ported rather than built from scratch — see §6 below on GenAI's role here. Chosen over a simpler "service layer" pattern because it makes the transaction boundary structural (ADR-0001) instead of a discipline to remember, which matters directly for a domain whose core requirement is a concurrency guarantee. |
| **Zod, per-route, no global pipe** | One validation library, applied explicitly where needed — see `directives/zod_validation.md` for why the global-pipe/DTO-class ergonomics of `nestjs-zod` weren't adopted at this scope. |
| **No Redis** | The idempotency store and the booking guarantee are both Postgres-native (`IdempotencyRecord`, the exclusion constraint). Adding Redis would be infrastructure for a problem Postgres already solves — see `.ai/plans/init-source.plan.md` §8.3. |
| **Prometheus + Grafana, provisioned as code** | Directly requested by the brief ("your strategy for observability"). Provisioning as code (not clicking through a UI) means the dashboard exists on any machine that clones the repo. |
| **No message broker, no second service** | See §5 below — deferred, not omitted. |

## 5. § Deferred scope

Every capability below was considered and deliberately **not built**, with the condition that
would bring it in. This section exists because *"clarity, logic, and foresight"* is explicitly
part of the evaluation — foresight is demonstrated by naming the boundary and its trigger, not by
building unused infrastructure or staying silent about what's missing.

| Capability | What it would do | Trigger | Where the seam is |
|---|---|---|---|
| **Transactional Outbox + message broker** | Reliably notify a customer/dealership when a booking is confirmed/cancelled, decoupled from the request | The first requirement for asynchronous notification work that can't just be a synchronous side effect of the booking request | `directives/resilience_patterns.md` §2; the CQRS command pipeline already has a clean point to append an outbox row in the same transaction |
| **Circuit breaker** | Protect against a slow/failing outbound dependency | The first synchronous call to something this service doesn't own (a DMS integration, a payment gateway) | `packages/shared-kernel`'s `resilience/circuit-breaker.ts` exists in the reference project, framework-free, ready to port back — `directives/resilience_patterns.md` §3.1 |
| **Rate limiting** | Protect against abusive traffic | Public-facing deployment, or evidence of abuse during testing | `directives/resilience_patterns.md` §4 |
| **A second service** | Split out a bounded context with its own release cadence | A genuinely separate bounded context appears (e.g. a standalone notifications service) | The monorepo shape (Turborepo, `apps/*`) already supports adding a workspace without restructuring |
| **RBAC / multi-tenancy** | Restrict who can book/view/cancel; isolate one dealership's data from another's | The assessment doesn't require it; would matter for a real multi-dealership deployment | `directives/multi_tenancy.md` exists in the reference project, not ported — see `.ai/plans/init-source.plan.md` §4 |
| **Kafka-consumer idempotency (natural-key/dedup-constraint patterns)** | Dedup for an eventual message consumer | Arrives together with the message broker above | `directives/idempotency_strategy.md`'s own deferred section |

**Why this list, not a longer one, and not a shorter one**: the reference project (Cortex) this
repo's base was ported from is a 5-service platform with Kafka, Elasticsearch, and a 19-container
compose file — genuinely earned there, by a platform that grew into those problems over time. None
of that infrastructure is earned by a single appointment-booking endpoint on day one. Shipping it
here would read as imitating enterprise architecture rather than understanding when each piece
becomes necessary — the opposite of the foresight this criterion asks for.

## 6. Observability strategy

**Logging**: structured JSON via `pino` (`createLogger`), one root logger per process, every
component injects a child logger — never an ad-hoc `createLogger()` call, never `console.log`
(`directives/logging_standard.md`). Every log line carries an explicit `context` tag
(`packages/shared-kernel/src/logger/log-context.ts`) and, automatically, W3C trace-correlation
fields (`trace_id`/`span_id`) — no call site has to remember either. Secrets and PII are redacted
in-process, before any transport, at any nesting depth.

**Metrics**: Prometheus scrapes `GET /metrics` — Node.js process defaults (CPU, heap, event-loop
lag) via `prom-client`'s `collectDefaultMetrics()`, plus `scheduler_api_db_transient_error_total`
from the shared-kernel resilience module. A Grafana dashboard (`scheduler-overview.json`,
provisioned as code) visualizes service-up, CPU, heap, and event-loop lag, with an explicit
placeholder panel for the booking-domain metrics that land once the scheduler domain is
implemented (booking success/conflict rate, availability-check latency).

**Tracing**: W3C `traceparent` propagation across the HTTP boundary (`TraceContextMiddleware` +
the automatic log-field injection above). This is correlation-id tracing, not full distributed
tracing (no span tree, no Jaeger/Tempo backend) — the honest scope is stated explicitly in
`directives/logging_standard.md` rather than implied by the presence of trace IDs in logs.

**Health**: `GET /health` checks the database connection and returns `200`/`503` accordingly —
what a container orchestrator or a load balancer would probe.

## 7. GenAI use in the design phase

See [`docs/12_ai_collaboration.md`](12_ai_collaboration.md) for the full account (Direction,
Context engineering, Guardrails, Verification loop, Where the AI was wrong, What stayed human).
Summary for this document specifically:

The base of this repository (monorepo tooling, CQRS/Unit-of-Work kernel, AI-agent workflow) was
**ported from an existing reference project** with AI assistance, guided by a written init plan
(`.ai/plans/init-source.plan.md`) created *before* any file was copied — the plan named which
files to port as-is, which to strip of business content, which to defer to a later tier, and why,
with every claim about the source project verified against its actual working tree rather than
assumed. During porting, the AI surfaced and fixed several real, verified issues that only
appeared once code actually ran (a Prisma 7 schema syntax change, two missing dependencies that
only worked in the source project by accident of monorepo hoisting, a `fastify` package-version
duplication breaking TypeScript's structural typing) — logged in `.ai/memory/gotchas.jsonl` as
they were found, not reconstructed afterward.

The one decision that was **not** delegated: the shape of the anti-double-booking guarantee
(ADR-0002). The AI proposed and implemented the exclusion-constraint mechanism; the choice to
solve it at the database layer rather than in application code, and the verification that it
actually holds (tested live against Postgres, not just read as documentation), was directed and
checked by a human before being accepted as the flagship design decision of this scenario.
